/**
 * Test hooks. Pages opened with "?test=1" freeze the clock, use a fixed seed and expose a
 * small API on window.__g499 so smoke tests can step frames and read state deterministically.
 */
import { isTier, type Tier } from './quality';

export interface TestModeState {
  enabled: boolean;
  seed: number;
  frozen: boolean;
  tier: Tier | null;
}

export const DEFAULT_TEST_SEED = 499;

export function readTestMode(search?: string): TestModeState {
  const q = search ?? (typeof location !== 'undefined' ? location.search : '');
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(q);
  } catch {
    params = new URLSearchParams();
  }
  const enabled = params.get('test') === '1';
  const seedRaw = params.get('seed');
  const seedNum = seedRaw === null ? Number.NaN : Number(seedRaw);
  const tierRaw = params.get('tier');
  return {
    enabled,
    seed: Number.isFinite(seedNum) ? Math.floor(seedNum) : DEFAULT_TEST_SEED,
    frozen: enabled && params.get('live') !== '1',
    tier: isTier(tierRaw) ? tierRaw : null,
  };
}

export interface TestApi {
  ready: boolean;
  version: string;
  seed: number;
  tier: Tier;
  frozen: boolean;
  step: (frames: number) => void;
  sample: () => { total: number; distinct: number; nonBackground: number } | null;
  frameTimes: () => number[];
  state?: () => unknown;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __g499?: Partial<TestApi>;
  }
}

export function exposeTestApi(api: Partial<TestApi>): Partial<TestApi> {
  if (typeof window === 'undefined') return api;
  const merged: Partial<TestApi> = { ...(window.__g499 ?? {}), ...api };
  window.__g499 = merged;
  return merged;
}

/** Record whether WebGL started (smoke tests read data-g499-gl to decide on pixel checks). */
export function markGl(available: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-g499-gl', available ? '1' : '0');
}

export function markReady(): void {
  if (typeof window === 'undefined') return;
  window.__g499 = { ...(window.__g499 ?? {}), ready: true };
  document.documentElement.setAttribute('data-g499-ready', '1');
}
