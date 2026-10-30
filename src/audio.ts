/**
 * Tiny WebAudio synthesizer. No audio files: every sound is generated here.
 * Calm, short, pleasant. A global mute is persisted under "g499:mute".
 */
import { storage, type KitStorage } from './storage';

export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface ToneOptions {
  freq: number;
  duration?: number;
  type?: WaveType;
  volume?: number;
  attack?: number;
  release?: number;
  /** Glide to this frequency over the duration. */
  slideTo?: number;
  /** Start delay in seconds. */
  delay?: number;
}

/** MIDI note number to frequency in Hz (69 = A4 = 440 Hz). */
export function noteToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const MUTE_KEY = 'mute';

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mutedFlag: boolean;
  private readonly store: KitStorage;
  private readonly listeners = new Set<(muted: boolean) => void>();

  constructor(store: KitStorage = storage) {
    this.store = store;
    this.mutedFlag = store.get<boolean>(MUTE_KEY, false) === true;
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  onMuteChange(cb: (muted: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    this.store.set(MUTE_KEY, muted);
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.02);
    }
    for (const cb of this.listeners) cb(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedFlag);
    return this.mutedFlag;
  }

  /** Re-read the persisted mute flag without writing anything (after "clear my data"). */
  reload(): void {
    this.mutedFlag = this.store.get<boolean>(MUTE_KEY, false) === true;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.mutedFlag ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    for (const cb of this.listeners) cb(this.mutedFlag);
  }

  /** Create or resume the AudioContext. Call from a user gesture (pointerdown / keydown). */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
    try {
      const ctx = new window.AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.mutedFlag ? 0 : 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      return null;
    }
  }

  tone(opts: ToneOptions): void {
    if (this.mutedFlag) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const duration = opts.duration ?? 0.12;
    const attack = opts.attack ?? 0.005;
    const release = opts.release ?? 0.08;
    const volume = opts.volume ?? 0.25;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + attack);
    gain.gain.setValueAtTime(volume, t0 + Math.max(attack, duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Short soft blip (hover, move). */
  blip(): void {
    this.tone({ freq: 880, duration: 0.07, type: 'sine', volume: 0.12 });
  }

  /** Bubbly pop (press, pick up). */
  pop(): void {
    this.tone({ freq: 620, slideTo: 310, duration: 0.11, type: 'triangle', volume: 0.22 });
  }

  /** Very short tick (menu navigation). */
  tick(): void {
    this.tone({ freq: 1320, duration: 0.03, type: 'square', volume: 0.05, release: 0.03 });
  }

  /** Happy rising arpeggio (goal, level up). */
  success(): void {
    const notes = [72, 76, 79, 84];
    notes.forEach((n, i) => {
      this.tone({
        freq: noteToFreq(n),
        duration: 0.14,
        type: 'triangle',
        volume: 0.18,
        delay: i * 0.07,
      });
    });
  }

  /** Gentle descending tone (miss). Never harsh. */
  fail(): void {
    this.tone({ freq: 330, slideTo: 220, duration: 0.25, type: 'sine', volume: 0.16 });
  }

  /** Soft filtered noise swoosh (swipe, whoosh). */
  whoosh(): void {
    if (this.mutedFlag) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.2);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.master = null;
    this.listeners.clear();
  }
}

export function createSynth(store?: KitStorage): Synth {
  return new Synth(store);
}

/**
 * Unlock audio on the first user gesture. Returns a function that removes the listeners.
 */
export function attachAutoUnlock(synth: Synth, target: EventTarget = window): () => void {
  const handler = () => synth.unlock();
  const events = ['pointerdown', 'keydown', 'touchstart'];
  for (const ev of events) target.addEventListener(ev, handler, { passive: true });
  return () => {
    for (const ev of events) target.removeEventListener(ev, handler);
  };
}
