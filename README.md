# games-kit

Shared toolkit for **499apps Games**, the privacy-first games site for kids at
`https://499apps.com/games/`. Every game repo and the hub use this kit.

## The privacy promise

- The games collect nothing. No accounts, ads, analytics, cookies or trackers.
- After the page loads, the games make no network calls.
- Scores, drawings and settings stay on your device in `localStorage` (keys start with `g499:`).
- A "clear my data" control removes all of it.

## What is in the kit

| Module | Purpose |
| --- | --- |
| `theme.ts`, `styles.css` | Palette, lighting recipe, layout tokens, base CSS, left rail and drawer styles |
| `renderer.ts`, `quality.ts` | three.js renderer, bloom, vignette, ACES tone mapping, adaptive quality tiers |
| `scene-helpers.ts`, `particles.ts` | Studio lights, candy materials, playroom, easing, seeded particle bursts |
| `stage.ts` | Boot sequence for 3D pages: canvas, renderer or fallback, loop, input, test API |
| `audio.ts` | WebAudio synthesiser with a persisted mute |
| `input.ts` | Keyboard, touch (tap and swipe), pointer and gamepad mapped to actions |
| `storage.ts` | `g499:` storage and `clearAllUserData` |
| `menu.ts`, `shell.ts`, `icons.ts` | Left rail and drawer menu, app shell, original SVG icons |
| `sw-register.ts` | Service worker registration (standalone or assembled) |
| `prng.ts` | Seeded random numbers for deterministic replays |
| `csp.ts` | The Content-Security-Policy and PWA head tags |
| `test-mode.ts` | `?test=1` hooks: frozen clock, fixed seed, `window.__g499` |
| `vite-kit.ts` | Vite build options: safe output names, Liquid guard, assembled manifest link |
| `smoke/` | Playwright projects, helpers and the shared smoke suite |
| `scripts/` | `kit-sync`, precache generator, icon generator, `scan-secrets`, CI runners, static server |
| `config/` | Shared TypeScript, ESLint and Prettier config |

## Commands

Use Node 20.19 or later and pnpm 10.

```sh
pnpm install
pnpm ci:local      # typecheck, lint, unit tests and scan:secrets, in parallel
pnpm test          # Vitest only
pnpm scan:secrets  # look for secrets, user paths and e-mail addresses
```

## How a repo uses the kit

1. Keep `games-kit` next to the consumer repo (sibling folders).
2. In the consumer repo, run `pnpm kit:sync`.
3. The script copies `../games-kit/src` into `src/kit/` and writes `kit.lock`.
4. Commit `src/kit/` and `kit.lock`. Each repo then builds alone from a fresh clone.

## How it fits into 499apps.com/games

The hub repo (`499apps/games`) builds the hub and assembles every game into one `site/`
folder with one service worker. The site is copied into the 499apps.com Pages repo by a
pull request. There are no GitHub Actions. See `docs/PLAN.md` in the hub repo.

## Licence

MIT. See `LICENSE` and `LICENSES.md`.
