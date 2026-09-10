# AGENTS.md

This is a browser-extension clipboard history manager built with **Plasmo** (React 18 + Mantine v6 + Jotai, TypeScript). See `CLAUDE.md` and `README.md` for the standard command list; they are the source of truth for scripts.

## Cursor Cloud specific instructions

Dependencies are installed automatically on startup (`pnpm install`). pnpm is the required package manager (`pnpm-lock.yaml`); do not use npm/yarn to install.

### Running the extension
- Dev build (Chrome MV3): `pnpm dev` — this is a long-running watcher, so start it in a background tmux session, not a blocking foreground command. It emits an unpacked build to `build/chrome-mv3-dev` (initial build takes ~20s; the log line `Extension re-packaged` signals completion). `pnpm build` is the production build and is NOT what you want for development.
- Environment variables are loaded from the committed `.env.development` automatically by Plasmo; no `.env` setup is needed to run the extension locally. `DEEPL_API_KEY` (`.env.local`) is only for `pnpm generate:translations`.

### Loading & testing in Chrome (manual testing)
- Load the unpacked extension at `chrome://extensions` → enable Developer mode → "Load unpacked" → select `build/chrome-mv3-dev`.
- The clipboard **monitor toggle** is the switch in the top-right of the popup header; it may already be ON. Clipboard capture only happens while it is enabled.
- Capture flow: copy text on any normal web page (e.g. `example.com`) with Ctrl+C, then open the popup — the text shows up at the top of the history. Polling interval is ~800ms (`utils/background.ts`), so allow a moment.
- Gotcha: opening the popup by navigating a tab directly to `chrome-extension://<id>/popup.html` can be blocked (`ERR_BLOCKED_BY_CLIENT`). Open the popup via the extension toolbar icon instead.
- On Chrome MV3 the service worker cannot read the clipboard directly; capture runs in an **offscreen document** (`offscreen.ts`, created by `background/index.ts`). Every captured item funnels through `handleCreateEntryRequest` in `background/messages/createEntry.ts` — the single choke point for new entries.

### Lint / build
- `pnpm lint` (ESLint) and `npx prettier . --check` are the only quality gates (enforced in CI via `.github/workflows/`). There are **no automated tests** in this repo.
