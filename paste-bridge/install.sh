#!/usr/bin/env bash
# Installs the Clipboard History <-> Paste native messaging host on macOS.
#
# Usage:
#   ./install.sh <EXTENSION_ID>
#
# Find <EXTENSION_ID> at chrome://extensions (enable Developer mode; it's the
# ID shown on the "Clipboard History" card). The unpacked dev build gets an ID
# derived from its path, so it differs per machine — pass yours explicitly.

set -euo pipefail

HOST_NAME="io.clipboardhistory.paste_bridge"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

EXTENSION_ID="${1:-}"
if [[ -z "${EXTENSION_ID}" ]]; then
  echo "error: missing extension id" >&2
  echo "usage: ./install.sh <EXTENSION_ID>   (find it at chrome://extensions)" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: Paste (and this bridge) are macOS-only." >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "error: Node.js 18+ is required but 'node' was not found on PATH." >&2
  exit 1
fi

echo "==> Installing @pasteapp/mcp into ${SCRIPT_DIR}"
( cd "${SCRIPT_DIR}" && npm install --no-audit --no-fund )

# Native messaging hosts run with a minimal environment, so we hardcode the
# absolute node path into a small launcher rather than relying on PATH.
LAUNCHER="${SCRIPT_DIR}/run-host.sh"
cat > "${LAUNCHER}" <<EOF
#!/bin/sh
exec "${NODE_BIN}" "${SCRIPT_DIR}/host.mjs"
EOF
chmod +x "${LAUNCHER}" "${SCRIPT_DIR}/host.mjs"

# Manifest that tells the browser how to launch the host and which extension
# may talk to it.
MANIFEST_JSON=$(cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Clipboard History <-> Paste MCP bridge",
  "path": "${LAUNCHER}",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${EXTENSION_ID}/"]
}
EOF
)

# Install into every Chromium-family browser whose profile dir exists.
TARGET_DIRS=(
  "${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "${HOME}/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
  "${HOME}/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  "${HOME}/Library/Application Support/Chromium/NativeMessagingHosts"
  "${HOME}/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "${HOME}/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
)

installed=0
for base in "${TARGET_DIRS[@]}"; do
  parent="$(dirname "${base}")"
  if [[ -d "${parent}" ]]; then
    mkdir -p "${base}"
    printf '%s\n' "${MANIFEST_JSON}" > "${base}/${HOST_NAME}.json"
    echo "==> Installed host manifest: ${base}/${HOST_NAME}.json"
    installed=$((installed + 1))
  fi
done

if [[ "${installed}" -eq 0 ]]; then
  echo "warning: no Chromium-family browser profile directories were found." >&2
fi

echo ""
echo "Done. Next:"
echo "  1. Make sure Paste is running with MCP enabled (Settings -> MCP & AI Tools)."
echo "  2. Fully quit and reopen your browser so it picks up the new host."
echo "  3. In the extension: Settings -> Paste -> enable 'Mirror to Paste' and click 'Send Test Item'."
echo "     The first call opens a Paste approval prompt for this tool."
