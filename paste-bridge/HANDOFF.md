# Paste mirroring — local implementation handoff

Handoff for continuing the "Mirror to Paste" work on the Mac, testing in Chrome
first, then loading in Edge on Windows. The extension side is implemented and
was validated end-to-end against **mock** MCP servers in CI; what remains is
verifying against the **real** Paste app and your LAN MCP-bridging service, and
tightening the tool mapping if needed.

## What's done (and how it was tested)

- Opt-in **Mirror to Paste** setting; every captured entry is forwarded to an
  MCP server via `initialize` → `tools/list` → `tools/call`.
- Two transports, selected in **Settings → Paste**:
  - **HTTP** (`utils/paste/mirror.ts` `HttpTransport`) — POSTs to a configured
    Streamable-HTTP URL; handles `Mcp-Session-Id` reuse and JSON/SSE responses.
  - **Native messaging** (`NativeTransport` + `host.mjs`) — pipes through Paste's
    official `@pasteapp/mcp` bridge on the same Mac.
- Verified with mock servers: `Save & Test` and real copies mirror correctly over
  both transports; failures never block clipboard capture.
- Not yet verified: the **real Paste MCP server**, its exact tool name/schema,
  the OAuth approval prompt, and your LAN service's CORS/PNA behavior.

## Prerequisites (Mac)

- Node.js 18+ and `pnpm` (`corepack enable` or `npm i -g pnpm`).
- Google Chrome.
- Paste 6.6+ with **Settings → MCP & AI Tools → Enable MCP** turned on.

## 1. Run the extension in Chrome (dev)

```bash
pnpm install
pnpm dev            # long-running watcher; builds to build/chrome-mv3-dev
```

- `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
  select `build/chrome-mv3-dev`.
- Copy the extension **ID** from the card (you'll need it for the native host).
- Open the popup, confirm the clipboard **monitor toggle** (top-right) is ON.

## 2. Wire up Paste — pick ONE path

### Path A: HTTP endpoint (required for cross-machine; good to test first)

Use this when the browser and Paste are on different machines, and it's the
simplest to iterate on. Point it at whatever exposes Paste's MCP over HTTP —
your LAN MCP-bridging service (e.g. `http://192.168.1.50:8888/mcp/paste`), or a
local `http://127.0.0.1:<port>/mcp/paste` while testing on the Mac itself.

1. **Settings → Paste** → enable **Mirror to Paste**.
2. Enter the URL in **MCP Endpoint (LAN)** (+ bearer token if the service needs one).
3. Click **Save & Test** and approve the network-access prompt.
4. Expect a green "Connected to Paste — Sent a test item via `<tool>` (http)".

Make sure the bridging service allows the request: answer the CORS preflight and,
if it enforces Private Network Access, send `Access-Control-Allow-Private-Network: true`.

### Path B: Native messaging bridge (same-Mac only)

1. Leave the endpoint URL blank.
2. Install the host (needs the extension ID from step 1):
   ```bash
   cd paste-bridge
   ./install.sh <EXTENSION_ID>
   ```
3. Fully quit and reopen Chrome.
4. **Settings → Paste** → enable **Mirror to Paste** → **Save & Test**.
5. On first call, approve the tool in Paste's MCP settings. Expect the green
   success notification with `(native)`.

## 3. Verify it actually lands in Paste

After a successful test, copy some fresh text on any page and confirm the item
appears in Paste's clipboard history. Watch for a **feedback loop**: if Paste's
"save item" writes back to the OS clipboard, the extension could re-capture it.
If you see duplicates growing, that's the cause — guard by ignoring items whose
content equals the last mirrored value (extend `clipboardSnapshot` handling).

## 4. Likely local adjustments

- **Tool name / arguments.** `pickSaveTool()` in `utils/paste/mirror.ts` guesses
  the save tool by name/schema and maps the text into a `text`/`content`-style
  field. The `Save & Test` result and the background console log the tool names
  Paste reported — if the guess is wrong, hardcode the correct tool name and
  argument key there.
- **Response shape.** `HttpTransport` decodes both JSON and SSE. If Paste's
  server returns something unexpected, inspect it via the service worker console
  (`chrome://extensions` → the extension → "Inspect views: service worker").
- **Auth.** Direct HTTP to Paste's own server requires OAuth; a bridging service
  usually terminates that itself. Use the bearer-token field if yours needs one.

## 5. Loading in Edge on Windows (later)

- Edge is Chromium: `edge://extensions` → Developer mode → **Load unpacked** →
  the same `build/chrome-mv3-dev` output (or a packaged build). The extension ID
  will differ from Chrome's.
- Use **Path A (HTTP)** only — native messaging can't reach another machine.
  Set the endpoint to the Mac's LAN URL and grant the permission prompt.
- If you later package for the Edge Add-ons store, note the Windows native
  messaging host registration is registry-based and is not needed for the HTTP path.

## Key files

- `utils/paste/mirror.ts` — transports, tool discovery, mirror logic.
- `background/messages/createEntry.ts` — the single capture hook that fires the mirror.
- `background/messages/testPasteMirror.ts` — backs the "Save & Test" button.
- `popup/components/modals/SettingsModalContent.tsx` — the Paste settings tab.
- `types/settings.ts` — `pasteMirrorEnabled`, `pasteMcpUrl`, `pasteMcpToken`.
- `paste-bridge/` — native host (`host.mjs`), `install.sh`, `README.md`.

## Tip: iterate without the real app

A tiny mock Streamable-HTTP MCP server (Node `http` server that answers
`initialize` with an `Mcp-Session-Id`, `tools/list` with a `save_item` tool, and
`tools/call` by logging the text) lets you exercise the whole HTTP path offline —
useful for confirming wiring before pointing at real Paste.
