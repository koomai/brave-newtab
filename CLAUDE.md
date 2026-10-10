# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MV3 browser extension that replaces the new-tab page with a homepage written by a Claude Managed Agents session. The agent reads a digest of the user's browsing history, has the extension scrape up to 8 pages in the user's logged-in browser, and writes one React component that the new tab renders. There is no server: the extension's service worker talks to the Anthropic API directly with the user's own key.

`ARCHITECTURE.md` holds the event-flow diagram, the worker keepalive design and the Managed Agents API gotchas. Read it before changing `orchestrator.ts` or `build-manager.ts`.

## Commands

pnpm workspace (`pnpm@10.11.1`) with three members: `apps/extension`, `packages/agent-core`, `harness`. The harness scripts and tests run on Bun, not Node. Run everything from the repo root.

```bash
pnpm install             # also runs `wxt prepare`, which generates apps/extension/.wxt/
pnpm build               # → apps/extension/.output/chrome-mv3 (load unpacked from here)
pnpm dev                 # WXT dev build with hot reload
pnpm typecheck           # tsc --noEmit in every package

pnpm test                                             # bun test harness/
bun test harness/history-digest.test.ts               # one file
bun test harness/ -t "caps the site list"             # one test by name

pnpm extension:test      # loads the built extension into headless Chrome over CDP
```

There is no linter or formatter configured.

`pnpm extension:test` needs `pnpm build` first, makes no API calls, uses debugging port 9333, and expects Chrome at the default macOS path unless `CHROME_PATH` is set.

The `agent:*` scripts hit the real API and spend credits. They need `ANTHROPIC_API_KEY` in a root `.env` (Bun loads it automatically):

```bash
pnpm agent:run                      # full build with fixture history → harness/out/homepage.tsx
pnpm agent:verify [path]            # transform, evaluate and server-render that output
pnpm agent:resume-test              # kill a build with a tool call pending, then reattach
pnpm agent:retention <sessionId>    # confirm the session and uploads were deleted
```

## Architecture

### Three layers

- **`packages/agent-core`** is the agent loop, written against two interfaces from `types.ts`: `BrowserBridge` (`getHistory`, `getPageHtml`) and `KVStore`. It must not import `chrome.*`, `browser.*` or `node:*`. Its tsconfig sets `types: []` so `pnpm typecheck` enforces this. It is consumed as raw TypeScript (`main: index.ts`); there is no build step.
- **`apps/extension`** supplies the real bridge (`lib/browser-bridge.ts` over `chrome.history`, `chrome.tabs`, `chrome.scripting`) and a `KVStore` over `chrome.storage.local`.
- **`harness`** supplies a fixture-history and plain-`fetch` bridge plus a JSON-file `KVStore` (`harness/.agent-state.json`), so the same `runHomepageBuild` runs outside Chrome.

### Build flow

`runHomepageBuild` (`orchestrator.ts`) ensures a cached agent and environment, creates a session, opens the event stream, replays the session's event history, sends the kickoff message, then loops over events. The agent calls two custom tools that the host answers:

1. `getHistory`: `lib/history.ts` groups and scores `chrome.history` by domain, then `buildHistoryDigest` caps it and strips URLs before it goes back inline.
2. `getPageHtml`: `lib/scraper.ts` opens each URL in an unfocused window, injects `entrypoints/scraper.content.ts`, and sanitizes the HTML. The orchestrator uploads each page as a file and mounts it into the session sandbox mid-session, returning mount paths instead of page bodies.

The agent then uses sandbox `read`/`grep`/`glob` on the mounted files and `write`s `/mnt/session/outputs/homepage.tsx`. The orchestrator downloads that file (falling back to a fenced block in the final message) and, in a `finally`, deletes every uploaded file and the session.

### Worker owns the build, tabs are views

`BuildManager` (`lib/build-manager.ts`) lives in the service worker and runs at most one build per browser profile. New-tab pages connect on a port (`lib/protocol.ts`), get a snapshot, then receive phase/text/log deltas, which `useHomepageBuild.ts` reduces into React state. A build therefore survives closing the tab and shows in every open tab.

A 1-minute `chrome.alarms` heartbeat calls `BuildManager.tick()`, which either reattaches to an interrupted session (`activeSessionId` in storage) or evaluates the scheduled-rebuild policy in `lib/auto-rebuild.ts`.

### Rendering model-written code

The saved homepage is the agent's raw TSX. The new tab transpiles it with sucrase (`lib/transpile.ts`) and renders it inside a Sandpack iframe (`HomepagePreview.tsx`), never in the extension's own page.

## Things that span files

**Editing the system prompt or tool definitions does not affect existing agents.** `ensureAgent` (`setup.ts`) caches one agent ID per model under `agentId-<model>` and reuses it without updating it. After changing `HOMEPAGE_SYSTEM_PROMPT`, the tool list or the schemas, clear the cached ID: delete `harness/.agent-state.json` for harness runs, or remove the `agentId-*` keys from the extension's `chrome.storage.local`. The kickoff message from `buildKickoffMessage` is sent per build and takes effect immediately.

**Every `agent.custom_tool_use` must get a result.** `dispatch` in `orchestrator.ts` sends `user.custom_tool_result` on both the success and the error path. An unanswered call idles the session forever. The reattach path depends on the same rule: it replays history and re-answers any call with no matching result.

**The event loop's ordering is deliberate.** Open the stream before sending anything, replay `events.list` to cover the gap, dedupe by event `id`, and run the terminal check on every event including duplicates. `session.status_idle` ends the loop only when `stop_reason.type !== "requires_action"`. The remaining API gotchas (mount paths re-rooted under `/mnt/session/uploads/`, `custom_tool_use_id` vs `tool_use_id`, `files.upload` taking no `purpose`) are in `ARCHITECTURE.md` under "Gotchas worth knowing".

**The component contract is stated in four places.** A default-exported `PersonalizedHomepage`, React as the only import, inline styles: this is defined in `prompt.ts`, checked by regex in `harness/run-agent.ts`, exercised in `harness/verify-homepage.ts`, and assumed by `HomepagePreview.tsx` (which mounts the code as `/App.js` in Sandpack's `react` template). Change them together.

**Adding a `RunPhase`** means adding it to a step in `BUILD_STEPS` (`lib/protocol.ts`), or it will not move the progress stepper. `thinking` and `error` are left unmapped on purpose.

**All storage keys live in `KEYS` (`lib/storage.ts`)**, which spreads agent-core's `STORAGE_KEYS`. Add new persisted values there.

**Model choices are a single list**, `MODEL_CHOICES` in `setup.ts`. The Settings UI, the per-model agent cache key and the stored-setting fallback all derive from it.

**WXT conventions.** `browser`, `defineBackground` and `defineContentScript` are WXT auto-imports, and `@/` resolves to `apps/extension/`. Both come from the generated `.wxt/` directory, so the extension will not typecheck until `wxt prepare` has run. The scraper is a runtime-registered content script: `scraper.ts` injects it by its built path `/content-scripts/scraper.js`, which WXT derives from the filename `scraper.content.ts`.

**The extension's own UI uses Kumo (`@cloudflare/kumo`) on Tailwind CSS v4.** `entrypoints/newtab/styles.css` imports Kumo's theme before `tailwindcss` and carries the `@source` line that lets Tailwind see Kumo's classes in `node_modules`; the Tailwind Vite plugin is registered in `wxt.config.ts`. Use Kumo components and its `kumo-*` colour tokens (`text-kumo-subtle`, `bg-kumo-base`) for new UI, not inline styles. `pnpm --filter @homepage/extension exec kumo ls` lists components and `... exec kumo doc <Component>` prints props and examples. The build-progress screen is the exception: it is hand-written CSS in the same stylesheet. None of this reaches the generated homepage, which renders in the Sandpack iframe.

**The harness bridge is not a production fallback.** It uses fixture history and an anonymous `fetch`, so it cannot see logged-in or JS-rendered pages.

## Security and privacy constraints

- Scraped page content is untrusted input. The agent's `bash` tool is disabled in `setup.ts` for that reason; keep it off.
- Session event logs and uploaded files hold browsing data server-side. Cleanup in the orchestrator's `finally` must keep running on every exit path.
- The API key sits in `chrome.storage.local` and the client is created with `dangerouslyAllowBrowser: true`. That is accepted for a self-run tool and is the reason this must not be published to a store as-is.
