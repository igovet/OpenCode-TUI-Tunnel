---
name: frontend-development
description: Frontend implementation rules and pitfalls for Svelte 5, PWA, storage, and terminal WebSocket flows
---

## Use This Skill

Put this line at the top of your prompt:

`@frontend-development`

Then describe the UI/frontend change you need.

## Svelte 5 Runes (Required)

This repo uses Svelte 5 runes, not legacy reactive syntax.

Use patterns like:

```ts
let value = $state(0);
let doubled = $derived(value * 2);
$effect(() => {
  // side effects
});
let { propA } = $props<{ propA: string }>();
```

Do not introduce legacy `$:` patterns in new code.

## Dev Server and API/WS Routing

Frontend Vite config (`web/vite.config.ts`) proxies `/api` (including WS) to:

`http://127.0.0.1:4096`

Terminal WebSocket client connects to:

`/api/sessions/:id/stream?cols=...&rows=...`

Protocol behavior to preserve:

- Client sends `hello`, `input`, `resize`.
- Server sends `ready`, `status`, `exit`, `error`.
- Client attempts reconnect (~2s) only when session has not been marked exited.

## PWA Implementation Reality

PWA in this repo is static-file based (no generator plugin):

- `web/public/manifest.webmanifest`
- `web/public/sw.js`
- registration in `web/src/lib/pwa.ts` and `web/src/main.ts`

When changing PWA behavior, edit these files directly and verify install/update flow in browser.

## Icon Generation Gap

`npm run generate-icons` executes `scripts/generate-icons.mjs`.

Current script writes:

- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`
- `apple-touch-icon.png`

Manifest also references `icon-maskable-192.png`. Treat this as a maintenance risk:

- If regenerated assets drift, maskable 192 icon may be stale/missing unless managed separately.

## Known UI Drift Risk: Hardcoded Max Sessions Text

`web/src/pages/SessionList.svelte` has user text:

- `Maximum number of concurrent sessions (8) is already running.`

`8` is hardcoded and can drift from `config.sessions.maxConcurrent`.

If touching session-limit UX, align displayed limit with backend-configured value.

## Browser Storage Contract

Frontend keeps local state in browser storage. Keep keys stable unless migration is planned:

- `opencode-tui-workspace` (tabs + active tab)
- `termLastCols` / `termLastRows` (last terminal geometry)
- `terminal-zoom-desktop` / `terminal-zoom-mobile` (font zoom)

When renaming keys, provide backward-compatible migration logic.

## Practical Verification Checklist

After frontend changes:

```bash
npm run build:web
npm run lint
```

Then manually verify:

1. Session launch/attach opens terminal tab.
2. Terminal reconnect behavior after transient WS interruption.
3. PWA install prompt/service worker behavior still works.
4. Local storage state restores tabs/zoom as expected.
