# Contributing

Thank you for your help. Read these rules before you open a pull request.

## Local CI only

- This project has no GitHub Actions. Do not add a `.github/workflows` folder.
- Run `pnpm ci:local` before you open a pull request. It must pass.
- `ci:local` runs typecheck, lint, unit tests and `scan:secrets` in parallel.
- Consumer repos also run build and the Playwright smoke suite.

## Clean-room and licensing

- Write original code for public game mechanics. Do not copy code, sprites, sounds or ROMs.
- Do not use trademarked names, logos or brand trade dress.
- Third-party code must be MIT, CC0, OFL or Apache-2.0. Assets must be CC0 or MIT.
- List every third-party package or asset in `LICENSES.md`.

## Privacy rules

- No network requests after load. No `fetch`, XHR, WebSocket or beacon calls.
  The service worker precache of same-origin files is the only exception.
- No analytics, cookies, ads, accounts, fingerprinting or external links.
- Store data in `localStorage` only, through `storage.ts`. Every key starts with `g499:`.
- Keep the Content-Security-Policy as it is. Do not add `'unsafe-eval'` or inline scripts.
- Do not commit secrets, personal e-mail addresses or absolute user paths.
  `pnpm scan:secrets` checks this.

## Design rule: menus on the left

- All menus and settings go in the left rail (tablet and desktop).
- On phones, the rail becomes a left drawer. A left-edge button opens it.
- Never put menus top-right or on the right side.

## How the kit is shared

- Consumer repos vendor this kit. They run `pnpm kit:sync`.
- `kit:sync` copies `src/` into `src/kit/` and writes the kit git sha to `kit.lock`.
- Change the kit here first. Then re-sync each consumer and commit the vendored copy.
- Keep the public API stable. Add to it only when a consumer needs it.

## Code style

- TypeScript strict mode. Prettier formats the code (`pnpm format`).
- Keep game rules in pure modules with Vitest tests. Put randomness through `prng.ts`.
