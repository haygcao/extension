# Paste bridge (native messaging host)

Lets the Clipboard History extension save captured clipboard items into the
[Paste](https://pasteapp.io) app. There are two ways to connect, chosen in the
extension's **Settings → Paste** tab:

## Option A — HTTP MCP endpoint (works cross-machine, no native host)

If you can reach an MCP endpoint over HTTP, just set that URL in **Settings →
Paste → MCP Endpoint (LAN)** and click **Save & Test**. This is the option to
use when the browser and Paste run on **different machines** — e.g. Edge on
Windows with Paste on a Mac exposed by a LAN MCP-bridging service at something
like `http://192.168.1.50:8888/mcp/paste`.

```
extension (service worker) ──fetch (Streamable HTTP)──▶ http://<mac-ip>:<port>/mcp/paste
```

- No native host install is needed.
- The extension requests a host permission for the URL's origin the first time
  you click **Save & Test** (that's why the button needs a click — permission
  prompts require a user gesture).
- If the endpoint needs auth, put a bearer token in the token field.
- Cross-origin/private-network note: the extension has the granted host
  permission, but make sure your bridging service allows the request (respond to
  CORS preflight and, if applicable, send `Access-Control-Allow-Private-Network: true`).

`nativeMessaging` cannot reach a network address — it only launches a local host
process — so cross-machine setups must use this HTTP option.

## Option B — Native messaging host (same Mac only)

When the browser and Paste run on the **same Mac**, leave the endpoint blank and
install this native messaging host. It's a thin Chrome native messaging host
that pipes MCP JSON-RPC between the extension and Paste's official
[`@pasteapp/mcp`](https://www.npmjs.com/package/@pasteapp/mcp) server (which
handles Paste port discovery, OAuth, and transport).

```
extension (service worker)
   │  chrome.runtime.connectNative
   ▼
host.mjs  ──spawns──▶  @pasteapp/mcp  ──HTTP──▶  Paste local MCP server
```

The rest of this document covers Option B.

## Requirements

- macOS with **Paste 6.6+**, MCP enabled in **Settings → MCP & AI Tools**
- **Node.js 18+** (`node --version`)
- A Chromium-family browser (Chrome, Brave, Edge, Chromium…)

## Install

1. Find the extension ID at `chrome://extensions` (enable Developer mode — it's
   on the "Clipboard History" card). The unpacked dev build's ID is derived from
   its path, so it's specific to your machine.
2. Run the installer with that ID:

   ```bash
   cd paste-bridge
   ./install.sh <EXTENSION_ID>
   ```

   This installs `@pasteapp/mcp` locally, writes a launcher, and drops the host
   manifest into the `NativeMessagingHosts` directory of each installed
   Chromium-family browser.

3. Fully quit and reopen your browser.
4. In the extension: **Settings → Paste → enable "Mirror to Paste"**, then click
   **Send Test Item**. The first call triggers a Paste approval prompt for this
   tool; approve it. After that, every newly captured clipboard item is mirrored
   into Paste automatically.

## Uninstall

Delete the manifest from the relevant browser dir(s), e.g.:

```bash
rm "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.clipboardhistory.paste_bridge.json"
```

## Troubleshooting

- **"Could not reach Paste" / host not found** — reopen the browser after
  installing; confirm the extension ID passed to `install.sh` matches the one at
  `chrome://extensions`.
- **"Paste exposed no save-capable tool"** — update Paste; the test result lists
  the tool names Paste reported so the mapping can be adjusted.
- **Nothing saved but no error** — make sure Paste is running with MCP enabled
  and that you approved this tool in Paste's MCP settings.

## Notes

- Everything runs locally; nothing is sent to Paste's servers by the bridge.
- `node_modules/` and the generated `run-host.sh` are not committed.
