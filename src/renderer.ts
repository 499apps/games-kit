/**
 * Renderer: three.js WebGLRenderer + RoomEnvironment reflections + EffectComposer
 * (bloom, vignette, ACES tone mapping, sRGB output) + adaptive quality tiers.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FrameMonitor, TIERS, type QualitySettings, type Tier } from './quality';
import { lighting, palette } from './theme';
import type { GameClock } from './lifecycle';
import { disposeObject } from './scene-helpers';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.3 },
    softness: { value: 0.55 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float softness;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.9);
      float r = length(d);
      float edge = 1.0 - smoothstep(0.78 - softness, 0.78, r);
      c.rgb *= mix(1.0 - strength, 1.0, edge);
      gl_FragColor = c;
    }`,
};

export interface KitRendererOptions {
  canvas: HTMLCanvasElement;
  /** Element whose size the canvas follows. */
  container: HTMLElement;
  tier?: Tier;
  reducedMotion?: boolean;
  clearColor?: string;
  exposure?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  vignette?: number;
  fov?: number;
}

export interface PixelSample {
  total: number;
  distinct: number;
  nonBackground: number;
}

export interface KitRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  readonly settings: QualitySettings;
  readonly width: number;
  readonly height: number;
  /** Lights whose castShadow follows the quality tier. */
  shadowLights: THREE.Light[];
  setTier(tier: Tier): void;
  resize(): void;
  render(): void;
  sampleCanvasPixels(step?: number): PixelSample;
  dispose(): void;
}

/** True when a WebGL2 context can be created (no console noise when it cannot). */
export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Reports the unmasked renderer string when available (used by tests to spot software GL). */
export function describeGpu(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const plain = String(gl.getParameter(gl.RENDERER));
    return unmasked || plain;
  } catch {
    return 'unknown';
  }
}

export function createKitRenderer(o: KitRendererOptions): KitRenderer | null {
  if (!webglAvailable()) return null;
  let settings: QualitySettings = TIERS[o.tier ?? 'medium'];
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: o.canvas,
      antialias: settings.antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
  const clear = new THREE.Color(o.clearColor ?? palette.night);
  renderer.setClearColor(clear, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? lighting.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = clear;
  const camera = new THREE.PerspectiveCamera(o.fov ?? 40, 1, 0.1, 200);
  camera.position.set(0, 4, 12);
  camera.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTexture = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTexture;
  pmrem.dispose();

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomCfg = o.bloom ?? lighting.bloom;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    bloomCfg.strength,
    bloomCfg.radius,
    bloomCfg.threshold,
  );
  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms['strength'].value = o.vignette ?? lighting.vignette;
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(vignettePass);
  composer.addPass(outputPass);

  let width = 1;
  let height = 1;
  const shadowLights: THREE.Light[] = [];

  const applyTier = () => {
    const dpr = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      settings.pixelRatioCap,
    );
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    bloomPass.enabled = settings.bloom;
    for (const light of shadowLights) {
      light.castShadow = settings.shadows;
      const shadow = (light as THREE.DirectionalLight).shadow;
      if (shadow) {
        if (shadow.mapSize.x !== settings.shadowMapSize) {
          shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
          if (shadow.map) {
            shadow.map.dispose();
            shadow.map = null;
          }
        }
      }
    }
  };

  const resize = () => {
    const w = Math.max(1, o.container.clientWidth || window.innerWidth);
    const h = Math.max(1, o.container.clientHeight || window.innerHeight);
    width = w;
    height = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  };

  applyTier();
  resize();

  const kit: KitRenderer = {
    renderer,
    scene,
    camera,
    composer,
    bloomPass,
    shadowLights,
    get settings() {
      return settings;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    setTier(tier) {
      if (settings.tier === tier) return;
      settings = TIERS[tier];
      applyTier();
      resize();
    },
    resize,
    render() {
      composer.render();
    },
    sampleCanvasPixels(step = 8) {
      composer.render();
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const counts = new Map<number, number>();
      let total = 0;
      const s = Math.max(1, Math.floor(step));
      for (let y = 0; y < h; y += s) {
        for (let x = 0; x < w; x += s) {
          const i = (y * w + x) * 4;
          const q =
            (((buf[i] as number) >> 3) << 10) |
            (((buf[i + 1] as number) >> 3) << 5) |
            ((buf[i + 2] as number) >> 3);
          counts.set(q, (counts.get(q) ?? 0) + 1);
          total++;
        }
      }
      let mode = 0;
      for (const c of counts.values()) if (c > mode) mode = c;
      return { total, distinct: counts.size, nonBackground: total - mode };
    },
    dispose() {
      disposeObject(scene);
      envTexture.dispose();
      bloomPass.dispose();
      vignettePass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return kit;
}

export interface LoopOptions {
  kit: KitRenderer;
  clock: GameClock;
  update: (dt: number, elapsed: number) => void;
  /** Adjust the quality tier from measured frame times (off in frozen test mode). */
  adaptive?: boolean;
  monitor?: FrameMonitor;
  onTierChange?: (tier: Tier) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  readonly running: boolean;
  readonly paused: boolean;
  /** Last real frame durations in ms (up to 240). */
  readonly frameTimes: number[];
}

export function createLoop(o: LoopOptions): Loop {
  const monitor = o.monitor ?? new FrameMonitor();
  const frameTimes: number[] = [];
  let handle = 0;
  let running = false;
  let paused = false;
  let lastReal: number | null = null;

  const frame = (now: number) => {
    if (!running || paused) return;
    handle = requestAnimationFrame(frame);
    const realDt = lastReal === null ? 0 : now - lastReal;
    lastReal = now;
    if (realDt > 0) {
      frameTimes.push(realDt);
      if (frameTimes.length > 240) frameTimes.shift();
      if (o.adaptive && !o.clock.frozen) {
        const next = monitor.push(realDt, o.kit.settings.tier);
        if (next) {
          o.kit.setTier(next);
          o.onTierChange?.(next);
        }
      }
    }
    const dt = o.clock.tick(now);
    o.update(dt, o.clock.elapsed);
    o.kit.render();
  };

  return {
    get running() {
      return running;
    },
    get paused() {
      return paused;
    },
    frameTimes,
    start() {
      if (running) return;
      running = true;
      paused = false;
      lastReal = null;
      handle = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
    pause() {
      if (!running || paused) return;
      paused = true;
      cancelAnimationFrame(handle);
    },
    resume() {
      if (!running || !paused) return;
      paused = false;
      lastReal = null;
      handle = requestAnimationFrame(frame);
    },
  };
}
