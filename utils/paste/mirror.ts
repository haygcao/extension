// Mirrors captured clipboard entries into the Paste for Mac app via its MCP
// server. Two transports are supported:
//
//   * HTTP  — a Streamable-HTTP MCP endpoint (Paste's own local server, or a
//     LAN MCP-bridging service, e.g. http://192.168.1.50:8888/mcp/paste). Used
//     when a URL is configured. This is the only option when the browser and
//     Paste run on different machines (e.g. Edge on Windows, Paste on a Mac),
//     since native messaging can only reach a host process on the SAME machine.
//   * Native messaging — reuses Paste's official `@pasteapp/mcp` stdio bridge on
//     the same Mac (port discovery + OAuth handled for us). Used when no URL is
//     configured.
//
// Either way we speak plain MCP JSON-RPC: `initialize` -> `tools/list` (to
// discover the save tool) -> `tools/call`. Everything is best-effort; failures
// never block clipboard capture.

// Must match the `name` in the installed native messaging host manifest
// (see paste-bridge/install.sh). Only used by the native transport.
export const PASTE_BRIDGE_HOST = "io.clipboardhistory.paste_bridge";

const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "clipboard-history-extension", version: "1.4.20" };

// Tear down an idle connection so we don't hold a Node subprocess / HTTP
// session open forever.
const IDLE_DISCONNECT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface PasteMirrorConfig {
  url?: string;
  token?: string;
}

export interface MirrorResult {
  ok: boolean;
  error?: string;
  // Names of the tools the server exposed — surfaced so the exact save-tool
  // name can be verified/adjusted if the heuristic below ever misses.
  tools?: string[];
  toolUsed?: string;
  transport?: "http" | "native";
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

interface SaveTool {
  name: string;
  textKey: string;
}

interface Transport {
  readonly kind: "http" | "native";
  request(method: string, params?: unknown): Promise<JsonRpcResponse>;
  notify(method: string, params?: unknown): Promise<void>;
  dispose(): void;
}

// WHATWG-compliant-ish SSE decoder: concatenates multi-`data:` lines, strips a
// leading space, ignores comment/event/id lines. Mirrors the decoder Paste's
// own `@pasteapp/mcp` bridge uses so responses parse identically.
const parseSSE = (body: string): string[] => {
  let stream = body;
  if (stream.charCodeAt(0) === 0xfeff) {
    stream = stream.slice(1);
  }
  const normalized = stream.replace(/\r\n|\r/g, "\n");
  const messages: string[] = [];
  for (const event of normalized.split("\n\n")) {
    if (event === "") {
      continue;
    }
    const dataLines: string[] = [];
    for (const rawLine of event.split("\n")) {
      if (rawLine === "" || rawLine.startsWith(":")) {
        continue;
      }
      const colon = rawLine.indexOf(":");
      const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
      let value = colon === -1 ? "" : rawLine.slice(colon + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
      if (field === "data") {
        dataLines.push(value);
      }
    }
    if (dataLines.length > 0) {
      messages.push(dataLines.join("\n"));
    }
  }
  return messages;
};

// Streamable-HTTP transport: one POST per JSON-RPC frame, capturing and reusing
// the `Mcp-Session-Id` and decoding either JSON or SSE responses.
class HttpTransport implements Transport {
  readonly kind = "http" as const;
  private sessionId: string | undefined;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {}

  private async post(body: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const returnedSession = response.headers.get("Mcp-Session-Id");
    if (returnedSession && !this.sessionId) {
      this.sessionId = returnedSession;
    }
    return response;
  }

  async request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const response = await this.post(
      JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    );

    const text = await response.text();
    if (!response.ok && text.length === 0) {
      throw new Error(`Paste MCP endpoint returned HTTP ${response.status}.`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const frames = contentType.startsWith("text/event-stream")
      ? parseSSE(text)
      : text.length > 0
        ? [text]
        : [];

    let fallback: JsonRpcResponse | undefined;
    for (const frame of frames) {
      try {
        const parsed = JSON.parse(frame) as JsonRpcResponse;
        if (parsed.id === id) {
          return parsed;
        }
        if (parsed.result !== undefined || parsed.error !== undefined) {
          fallback = parsed;
        }
      } catch {
        // Ignore non-JSON frames (comments, keep-alives).
      }
    }
    if (fallback) {
      return fallback;
    }
    throw new Error(`Paste MCP endpoint returned no JSON-RPC response (HTTP ${response.status}).`);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.post(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }));
  }

  dispose(): void {
    this.sessionId = undefined;
  }
}

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Native messaging transport: pipes JSON-RPC frames through the local
// `@pasteapp/mcp` bridge (see paste-bridge/).
class NativeTransport implements Transport {
  readonly kind = "native" as const;
  private port: chrome.runtime.Port | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;

  private ensurePort(): chrome.runtime.Port {
    if (this.port) {
      return this.port;
    }

    const port = chrome.runtime.connectNative(PASTE_BRIDGE_HOST);
    this.port = port;

    port.onMessage.addListener((message: JsonRpcResponse) => {
      if (message === null || typeof message !== "object") {
        return;
      }
      const { id } = message;
      if (typeof id !== "number") {
        return;
      }
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    });

    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError;
      const reason = lastError?.message
        ? `Paste bridge disconnected: ${lastError.message}`
        : "Paste bridge disconnected.";
      const error = new Error(reason);
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.port = null;
    });

    return port;
  }

  request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const port = this.ensurePort();
    const id = this.nextId++;
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for "${method}" from Paste bridge.`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      try {
        port.postMessage({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    const port = this.ensurePort();
    port.postMessage({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
  }

  dispose(): void {
    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        // no-op
      }
      this.port = null;
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
  }
}

const unwrap = (response: JsonRpcResponse, method: string): unknown => {
  if (response.error) {
    throw new Error(`Paste "${method}" failed: ${response.error.message}`);
  }
  return response.result;
};

// Pick the tool the server exposes for saving a new clipboard item. Names
// aren't contractual, so match on intent and fall back to inspecting arguments.
const pickSaveTool = (tools: McpTool[]): SaveTool | null => {
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

interface Session {
  saveTool: SaveTool;
  toolNames: string[];
}

const handshake = async (transport: Transport): Promise<Session> => {
  unwrap(
    await transport.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    }),
    "initialize",
  );

  await transport.notify("notifications/initialized");

  const listed = unwrap(await transport.request("tools/list"), "tools/list") as
    | { tools?: McpTool[] }
    | undefined;
  const tools: McpTool[] = Array.isArray(listed?.tools) ? listed.tools : [];
  const toolNames = tools.map((tool) => tool.name);

  const saveTool = pickSaveTool(tools);
  if (!saveTool) {
    throw new Error(
      `Paste exposed no save-capable tool. Tools seen: ${toolNames.join(", ") || "(none)"}`,
    );
  }

  return { saveTool, toolNames };
};

interface ConnectionState {
  key: string;
  transport: Transport;
  ready: Promise<Session>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

let connection: ConnectionState | null = null;

const configKey = (config: PasteMirrorConfig): string =>
  config.url ? `http:${config.url}:${config.token ? "t" : ""}` : "native";

const teardown = () => {
  if (connection) {
    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
    }
    connection.transport.dispose();
    connection = null;
  }
};

const scheduleIdle = (state: ConnectionState) => {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
  }
  state.idleTimer = setTimeout(() => {
    if (connection === state) {
      teardown();
    }
  }, IDLE_DISCONNECT_MS);
};

const getConnection = (config: PasteMirrorConfig): ConnectionState => {
  const key = configKey(config);
  if (connection && connection.key === key) {
    return connection;
  }

  // Config changed (or first use): drop any previous connection.
  teardown();

  const transport: Transport = config.url
    ? new HttpTransport(config.url, config.token || undefined)
    : new NativeTransport();

  const state: ConnectionState = { key, transport, ready: handshake(transport), idleTimer: null };
  connection = state;
  return state;
};

// Mirror a single clipboard entry into Paste. Best-effort: resolves with an
// error result rather than throwing so callers can safely fire-and-forget.
export const mirrorToPaste = async (
  content: string,
  config: PasteMirrorConfig = {},
): Promise<MirrorResult> => {
  const usingHttp = Boolean(config.url);

  if (!usingHttp && process.env.PLASMO_TARGET === "firefox-mv2") {
    return { ok: false, error: "The native Paste bridge is only supported on Chromium builds." };
  }

  if (!usingHttp && (typeof chrome === "undefined" || !chrome.runtime?.connectNative)) {
    return { ok: false, error: "Native messaging is unavailable in this context." };
  }

  const state = getConnection(config);

  try {
    const { saveTool, toolNames } = await state.ready;

    const response = await state.transport.request("tools/call", {
      name: saveTool.name,
      arguments: { [saveTool.textKey]: content },
    });

    const result = unwrap(response, "tools/call") as McpToolResult | undefined;
    scheduleIdle(state);

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
        tools: toolNames,
        transport: state.transport.kind,
      };
    }

    return { ok: true, tools: toolNames, toolUsed: saveTool.name, transport: state.transport.kind };
  } catch (e) {
    // A dead/failed connection is dropped so the next attempt reconnects cleanly.
    teardown();
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      transport: usingHttp ? "http" : "native",
    };
  }
};
