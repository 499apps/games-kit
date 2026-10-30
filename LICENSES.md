# Third-party licences

games-kit is MIT licensed (see `LICENSE`). This file lists every third-party package the kit
uses. Assets: the kit has no third-party assets. Icons and app icons are original art drawn
in code (`src/icons.ts`, `src/scripts/lib/icon-art.mjs`). Sounds are synthesised at runtime
with WebAudio. Fonts come from the system font stack.

## Bundled into consumer builds

| Package | Licence | Use |
| --- | --- | --- |
| three (three.js), including `three/examples/jsm` add-ons (EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, RoomEnvironment, RoundedBoxGeometry) | MIT, Copyright 2010-2026 three.js authors | 3D rendering |

## Development only (not bundled, not shipped)

| Package | Licence |
| --- | --- |
| typescript | Apache-2.0 |
| vite | MIT |
| vitest | MIT |
| fast-check | MIT |
| @playwright/test, playwright | Apache-2.0 |
| eslint, @eslint/js | MIT |
| typescript-eslint | MIT |
| eslint-config-prettier | MIT |
| globals | MIT |
| prettier | MIT |
| @types/node, @types/three | MIT |

## Rules

- Only MIT, CC0, OFL or Apache-2.0 code may be added. Assets must be CC0 or MIT.
- Add every new dependency to this file in the same change.
