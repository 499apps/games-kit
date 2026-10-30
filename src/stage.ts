/**
 * Stage: the boot sequence every 3D page shares. Creates the canvas, renderer (or a friendly
 * no-WebGL fallback), clock, seeded RNG, input, render loop, resize and visibility handling,
 * the test API and page-exit disposal.
 */
import { InputManager } from './input';
import {
  onResize,
  onVisibilityChange,
  createClock,
  type GameClock,
} from './lifecycle';
import { createRng, type Rng } from './prng';
import { probeTier, type DeviceInfo, type Tier } from './quality';
import { createKitRenderer, createLoop, type KitRenderer, type KitRendererOptions, type Loop } from './renderer';
import { exposeTestApi, markGl, markReady, type TestApi, type TestModeState } from './test-mode';

export interface StageOptions {
  /** Element the canvas fills (sized by CSS). */
  host: HTMLElement;
  testMode: TestModeState;
  reducedMotion: boolean;
  /** Accessible name of the canvas. */
  label: string;
  /** Text for the no-WebGL fallback card. */
  fallback: { title: string; text: string };
  renderer?: Partial<Omit<KitRendererOptions, 'canvas' | 'container' | 'tier' | 'reducedMotion'>>;
}

export interface StageHooks {
  update(dt: number, elapsed: number): void;
  onResize?(width: number, height: number): void;
  onTierChange?(tier: Tier): void;
  dispose?(): void;
}

export interface Stage {
  readonly canvas: HTMLCanvasElement;
  /** Null when WebGL is unavailable (the fallback card is shown instead). */
  readonly kit: KitRenderer | null;
  readonly clock: GameClock;
  readonly rng: Rng;
  readonly input: InputManager;
  readonly tier: Tier;
  /** Start the render loop. Does nothing without WebGL. */
  run(hooks: StageHooks): void;
  /** Expose window.__g499 (with page state) and mark the page ready after the first frames. */
  ready(state: () => unknown, extra?: Partial<TestApi>): void;
  dispose(): void;
}

/** Cheap device facts for the startup quality probe. */
export function readDeviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const media = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  return {
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    dpr: window.devicePixelRatio || 1,
    isMobile: media('(pointer: coarse)'),
    width: window.screen?.width ?? window.innerWidth,
    height: window.screen?.height ?? window.innerHeight,
    reducedData: media('(prefers-reduced-data: reduce)'),
  };
}

export function createStage(o: StageOptions): Stage {
  const canvas = document.createElement('canvas');
  canvas.className = 'g499-stage';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', o.label);
  canvas.tabIndex = -1;
  o.host.append(canvas);

  const tier: Tier = o.testMode.tier ?? (o.testMode.frozen ? 'medium' : probeTier(readDeviceInfo()));
  const clock = createClock({ frozen: o.testMode.frozen });
  const seed = o.testMode.enabled ? o.testMode.seed : Math.floor(Math.random() * 0xffffffff);
  const rng = createRng(seed);
  const input = new InputManager({ element: canvas });

  const kit = createKitRenderer({
    ...(o.renderer ?? {}),
    canvas,
    container: o.host,
    tier,
    reducedMotion: o.reducedMotion,
  });
  markGl(kit !== null);

  if (!kit) {
    const card = document.createElement('div');
    card.className = 'g499-nogl';
    card.style.pointerEvents = 'none';
    const h = document.createElement('h1');
    h.textContent = o.fallback.title;
    const p = document.createElement('p');
    p.textContent = o.fallback.text;
    card.append(h, p);
    o.host.append(card);
  }

  let loop: Loop | null = null;
  let hooks: StageHooks | null = null;
  const offs: Array<() => void> = [];
  let disposed = false;

  const doResize = () => {
    if (!kit) return;
    kit.resize();
    hooks?.onResize?.(kit.width, kit.height);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    loop?.stop();
    for (const off of offs) off();
    hooks?.dispose?.();
    input.dispose();
    kit?.dispose();
  };

  const onPageHide = (e: PageTransitionEvent) => {
    if (!e.persisted) dispose();
  };
  window.addEventListener('pagehide', onPageHide);
  offs.push(() => window.removeEventListener('pagehide', onPageHide));

  return {
    canvas,
    kit,
    clock,
    rng,
    input,
    tier,
    run(h) {
      hooks = h;
      if (!kit || disposed) return;
      loop = createLoop({
        kit,
        clock,
        adaptive: !clock.frozen,
        update: (dt, elapsed) => {
          input.update();
          h.update(dt, elapsed);
        },
        onTierChange: (t) => h.onTierChange?.(t),
      });
      offs.push(onResize(doResize));
      offs.push(
        onVisibilityChange((hidden) => {
          if (!loop) return;
          if (hidden) loop.pause();
          else loop.resume();
        }),
      );
      doResize();
      loop.start();
    },
    ready(state, extra) {
      exposeTestApi({
        version: 'g499',
        seed: rng.seed,
        tier,
        frozen: clock.frozen,
        step: (frames: number) => clock.step(frames),
        sample: () => (kit ? kit.sampleCanvasPixels() : null),
        frameTimes: () => (loop ? loop.frameTimes.slice() : []),
        state,
        ...(extra ?? {}),
      });
      if (!kit) {
        markReady();
        return;
      }
      // Mark ready after two frames so the first picture is on screen.
      requestAnimationFrame(() => requestAnimationFrame(() => markReady()));
    },
    dispose,
  };
}
