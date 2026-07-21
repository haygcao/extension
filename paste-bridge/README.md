# Paste bridge (native messaging host)

Bridges the Clipboard History extension to the [Paste](https://pasteapp.io) app
on macOS so captured clipboard items are also saved into Paste. It's a thin
Chrome **native messaging** host that pipes MCP JSON-RPC between the extension
and Paste's official [`@pasteapp/mcp`](https://www.npmjs.com/package/@pasteapp/mcp)
server (which handles Paste port discovery, OAuth, and transport).

```
extension (service worker)
   │  chrome.runtime.connectNative
   ▼
host.mjs  ──spawns──▶  @pasteapp/mcp  ──HTTP──▶  Paste local MCP server
```

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
