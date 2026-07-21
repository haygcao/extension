// Mirrors captured clipboard entries into the Paste for Mac app via its local
// MCP server. A Chrome extension can't spawn a stdio MCP client or read Paste's
// port / OAuth token directly, so we reuse Paste's official `@pasteapp/mcp`
// bridge (which handles port discovery + OAuth + the Streamable-HTTP transport)
// through a Chrome native messaging host. This module speaks plain MCP JSON-RPC
// over that host: `initialize` -> `tools/list` (to discover the save tool) ->
// `tools/call`. Everything here is best-effort; failures never block capture.

// Must match the `name` in the installed native messaging host manifest
// (see paste-bridge/install.sh).
export const PASTE_BRIDGE_HOST = "io.clipboardhistory.paste_bridge";

const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "clipboard-history-extension", version: "1.4.20" };

// Tear down the bridge process after a period of inactivity so we don't hold a
// Node subprocess (and the Paste connection) open forever.
const IDLE_DISCONNECT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface MirrorResult {
  ok: boolean;
  error?: string;
  // Names of the tools Paste exposes — surfaced so the exact save-tool name can
  // be verified/adjusted if the heuristic below ever misses.
  tools?: string[];
  toolUsed?: string;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpTool {
  name: string;
  inputSchema?: { properties?: Record<string, { type?: string } | undefined> };
}

interface McpToolResult {
  isError?: boolean;
  content?: Array<{ text?: string }>;
}

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Connection {
  port: chrome.runtime.Port;
  pending: Map<number, PendingRequest>;
  nextId: number;
  // Resolves once the MCP handshake + tool discovery has completed for this
  // connection. Cached so repeated mirrors reuse the same session.
  ready: Promise<string>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

let connection: Connection | null = null;

const isFirefox = () => process.env.PLASMO_TARGET === "firefox-mv2";

const scheduleIdleDisconnect = (conn: Connection) => {
  if (conn.idleTimer) {
    clearTimeout(conn.idleTimer);
  }
  conn.idleTimer = setTimeout(() => {
    // Disconnecting rejects any stragglers and clears module state via the
    // onDisconnect handler wired up in connect().
    try {
      conn.port.disconnect();
    } catch {
      // no-op
    }
    if (connection === conn) {
      connection = null;
    }
  }, IDLE_DISCONNECT_MS);
};

const teardown = (conn: Connection, error: Error) => {
  if (conn.idleTimer) {
    clearTimeout(conn.idleTimer);
    conn.idleTimer = null;
  }
  for (const [, pending] of conn.pending) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  conn.pending.clear();
  if (connection === conn) {
    connection = null;
  }
};

const connect = (): Connection => {
  const port = chrome.runtime.connectNative(PASTE_BRIDGE_HOST);

  const conn: Connection = {
    port,
    pending: new Map(),
    nextId: 1,
    ready: Promise.resolve(""), // replaced below
    idleTimer: null,
  };

  port.onMessage.addListener((message: JsonRpcResponse) => {
    // The bridge emits one JSON-RPC frame per native message. Notifications
    // (no `id`) are ignored — we only correlate responses to our requests.
    if (message === null || typeof message !== "object") {
      return;
    }
    const { id } = message;
    if (typeof id !== "number") {
      return;
    }
    const pending = conn.pending.get(id);
    if (!pending) {
      return;
    }
    conn.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(message);
  });

  port.onDisconnect.addListener(() => {
    const lastError = chrome.runtime.lastError;
    const reason = lastError?.message
      ? `Paste bridge disconnected: ${lastError.message}`
      : "Paste bridge disconnected.";
    teardown(conn, new Error(reason));
  });

  conn.ready = handshake(conn);
  return conn;
};

const getConnection = (): Connection => {
  if (!connection) {
    connection = connect();
  }
  return connection;
};

const sendRequest = (
  conn: Connection,
  method: string,
  params?: unknown,
): Promise<JsonRpcResponse> => {
  const id = conn.nextId++;
  return new Promise<JsonRpcResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`Timed out waiting for "${method}" from Paste bridge.`));
    }, REQUEST_TIMEOUT_MS);

    conn.pending.set(id, { resolve, reject, timer });

    try {
      conn.port.postMessage({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
    } catch (e) {
      conn.pending.delete(id);
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
};

const sendNotification = (conn: Connection, method: string, params?: unknown) => {
  conn.port.postMessage({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
};

const unwrap = (response: JsonRpcResponse, method: string): unknown => {
  if (response.error) {
    throw new Error(`Paste "${method}" failed: ${response.error.message}`);
  }
  return response.result;
};

// Pick the tool Paste exposes for saving a new clipboard item. Names aren't
// contractual, so match on intent and fall back to inspecting arguments.
const pickSaveTool = (tools: McpTool[]): { name: string; textKey: string } | null => {
  const preferredKeys = ["text", "content", "value", "item", "data", "body"];

  const candidates = tools.filter(
    (tool) => /save|add|create|copy|new/i.test(tool.name) && !/pinboard/i.test(tool.name),
  );
  const ordered = candidates.length > 0 ? candidates : tools;

  for (const tool of ordered) {
    const properties = tool.inputSchema?.properties ?? {};
    const keys = Object.keys(properties);

    const textKey =
      preferredKeys.find((key) => keys.includes(key)) ??
      keys.find((key) => properties[key]?.type === "string") ??
      keys[0];

    if (textKey) {
      return { name: tool.name, textKey };
    }
  }

  return null;
};

// Discovered save tool for the active connection, resolved during handshake.
let saveTool: { name: string; textKey: string } | null = null;
let discoveredToolNames: string[] = [];

const handshake = async (conn: Connection): Promise<string> => {
  unwrap(
    await sendRequest(conn, "initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    }),
    "initialize",
  );

  sendNotification(conn, "notifications/initialized");

  const listed = unwrap(await sendRequest(conn, "tools/list"), "tools/list") as
    | { tools?: McpTool[] }
    | undefined;
  const tools: McpTool[] = Array.isArray(listed?.tools) ? listed.tools : [];
  discoveredToolNames = tools.map((tool) => tool.name);

  saveTool = pickSaveTool(tools);
  if (!saveTool) {
    throw new Error(
      `Paste exposed no save-capable tool. Tools seen: ${discoveredToolNames.join(", ") || "(none)"}`,
    );
  }

  scheduleIdleDisconnect(conn);
  return saveTool.name;
};

// Mirror a single clipboard entry into Paste. Best-effort: resolves with an
// error result rather than throwing so callers can safely fire-and-forget.
export const mirrorToPaste = async (content: string): Promise<MirrorResult> => {
  if (isFirefox()) {
    return { ok: false, error: "Paste mirroring is only supported on Chromium builds." };
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.connectNative) {
    return { ok: false, error: "Native messaging is unavailable in this context." };
  }

  try {
    const conn = getConnection();
    await conn.ready;

    if (!saveTool) {
      return {
        ok: false,
        error: "Paste save tool was not discovered.",
        tools: discoveredToolNames,
      };
    }

    const response = await sendRequest(conn, "tools/call", {
      name: saveTool.name,
      arguments: { [saveTool.textKey]: content },
    });

    const result = unwrap(response, "tools/call") as McpToolResult | undefined;
    scheduleIdleDisconnect(conn);

    // MCP tool results signal failure via `isError` rather than a JSON-RPC error.
    if (result?.isError) {
      const detail = Array.isArray(result.content)
        ? result.content
            .map((part) => part?.text)
            .filter(Boolean)
            .join(" ")
        : "";
      return {
        ok: false,
        error: `Paste rejected the item. ${detail}`.trim(),
        tools: discoveredToolNames,
      };
    }

    return { ok: true, tools: discoveredToolNames, toolUsed: saveTool.name };
  } catch (e) {
    // A dead/failed connection is dropped so the next attempt reconnects cleanly.
    connection = null;
    saveTool = null;
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      tools: discoveredToolNames.length > 0 ? discoveredToolNames : undefined,
    };
  }
};
