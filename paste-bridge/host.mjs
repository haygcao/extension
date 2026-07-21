#!/usr/bin/env node
// Chrome native messaging host that bridges the Clipboard History extension to
// Paste's official `@pasteapp/mcp` stdio server.
//
// Chrome speaks native messaging: each message is a 4-byte little-endian length
// prefix followed by UTF-8 JSON. `@pasteapp/mcp` speaks NDJSON: one JSON-RPC
// frame per line. This host is a thin, stateless adapter between the two — it
// spawns the Paste bridge once per connection and pipes frames both ways. All
// MCP logic (port discovery, OAuth, transport) lives in `@pasteapp/mcp`.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const require = createRequire(import.meta.url);

function resolveBridgeEntry() {
  // The package ships only a `bin` (no main/exports), so resolve via its
  // package.json and join the documented entry point.
  const pkgPath = require.resolve("@pasteapp/mcp/package.json");
  return join(dirname(pkgPath), "dist", "index.js");
}

function frame(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

function main() {
  const bridge = spawn(process.execPath, [resolveBridgeEntry()], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  bridge.on("error", (err) => {
    // Surface as a JSON-RPC-ish error and exit; the extension treats a dropped
    // connection as "Paste unavailable".
    process.stderr.write(`paste-bridge host: failed to start @pasteapp/mcp: ${err.message}\n`);
    process.exit(1);
  });

  bridge.on("exit", () => process.exit(0));

  // extension -> bridge: native frames become NDJSON lines.
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) {
        break;
      }
      const payload = buffer.subarray(4, 4 + length).toString("utf8");
      buffer = buffer.subarray(4 + length);
      if (bridge.stdin.writable) {
        bridge.stdin.write(payload + "\n");
      }
    }
  });
  process.stdin.on("end", () => {
    bridge.stdin.end();
    process.exit(0);
  });

  // bridge -> extension: NDJSON lines become native frames.
  const rl = createInterface({ input: bridge.stdout, terminal: false });
  rl.on("line", (line) => {
    if (line.length === 0) {
      return;
    }
    try {
      process.stdout.write(frame(JSON.parse(line)));
    } catch {
      // Ignore non-JSON diagnostics emitted by the bridge.
    }
  });

  process.stdout.on("error", (err) => {
    if (err.code === "EPIPE") {
      process.exit(0);
    }
  });
}

main();
