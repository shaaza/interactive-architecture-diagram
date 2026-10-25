// Playback state machine. Knows nothing about the DOM: the step player and the
// dwell time are injected, and listeners react to typed events.

import { Emitter } from '../lib/emitter';

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

// Looks the globals up at call time so test fake timers apply.
export const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface PlayOptions {
  animate: boolean;
  signal: AbortSignal;
}

export interface TimelineEvents<S> extends Record<string, unknown> {
  /** A new set of steps was loaded. */
  load: { steps: readonly S[] };
  /** The cursor moved. Fired before the step starts playing. -1 means no step shown. */
  cursor: { index: number; step: S | undefined };
  playing: { playing: boolean };
}

export interface TimelineOptions<S> {
  /** Plays one step. Must resolve when done, or soon after the signal aborts. */
  player: (step: S, index: number, opts: PlayOptions) => Promise<void> | void;
  /** How long to hold a step after it finishes, in ms at 1x speed. */
  dwell: (step: S) => number;
  clock?: Clock;
}

/** Pause before the first step when looping back to the start, at 1x speed. */
const RESET_PAUSE = 700;
const RESUME_DELAY = 250;
const LOOP_TOGGLE_DELAY = 400;

export class Timeline<S> extends Emitter<TimelineEvents<S>> {
  private _steps: readonly S[] = [];
  private _cursor = -1;
  private _playing = true;
  private _animating = false;
  private _speed = 1;
  private _loop = true;
  private controller = new AbortController();
  private timer: unknown = null;
  private readonly clock: Clock;

  constructor(private readonly opts: TimelineOptions<S>) {
    super();
    this.clock = opts.clock ?? realClock;
  }

  get steps(): readonly S[] { return this._steps; }
  get cursor(): number { return this._cursor; }
  get playing(): boolean { return this._playing; }
  get speed(): number { return this._speed; }
  get loop(): boolean { return this._loop; }

  /** Replaces the steps and shows `start` (-1 for none). */
  load(steps: readonly S[], start = steps.length ? 0 : -1): void {
    this.cancel();
    this._steps = steps;
    this.emit('load', { steps });
    this.setCursor(Math.max(-1, Math.min(start, steps.length - 1)));
  }

  setCursor(index: number, { animate = true }: { animate?: boolean } = {}): void {
    const signal = this.cancel();
    this._cursor = index;
    const step = this._steps[index];
    this.emit('cursor', { index, step });
    if (!step) {
      if (this._playing && this._steps.length) this.schedule(signal, RESET_PAUSE / this._speed);
      return;
    }
    this._animating = true;
    Promise.resolve(this.opts.player(step, index, { animate, signal })).then(() => {
      if (signal.aborted) return;
      this._animating = false;
      this.schedule(signal, this.opts.dwell(step) / this._speed);
    });
  }

  play(): void {
    this.setPlaying(true);
    const n = this._steps.length;
    if (!n) return;
    if (this._cursor >= n - 1 && !this._loop) this.setCursor(0);
    else if (!this._animating) this.schedule(this.controller.signal, RESUME_DELAY);
  }

  pause(): void {
    this.setPlaying(false);
    this.clearTimer();
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  /** Moves by `delta` steps and pauses, as manual stepping does. */
  step(delta: number): void {
    if (!this._steps.length) return;
    this.pause();
    this.setCursor(Math.max(-1, Math.min(this._steps.length - 1, this._cursor + delta)));
  }

  /** Jumps to a step and pauses. */
  goTo(index: number): void {
    this.pause();
    this.setCursor(index);
  }

  restart(): void {
    this.setPlaying(true);
    this.setCursor(0);
  }

  setSpeed(speed: number): void {
    this._speed = speed > 0 ? speed : 1;
  }

  setLoop(loop: boolean): void {
    this._loop = loop;
    if (loop && this._playing && !this._animating) this.schedule(this.controller.signal, LOOP_TOGGLE_DELAY);
  }

  /** Stops the running step and any pending advance. */
  cancel(): AbortSignal {
    this.controller.abort();
    this.controller = new AbortController();
    this.clearTimer();
    this._animating = false;
    return this.controller.signal;
  }

  /** Sets the play state without scheduling anything; the next load or step picks it up. */
  setPlaying(playing: boolean): void {
    if (this._playing === playing) return;
    this._playing = playing;
    this.emit('playing', { playing });
  }

  private advance(): void {
    const n = this._steps.length;
    if (!n) return;
    if (this._cursor < n - 1) this.setCursor(this._cursor + 1);
    else if (this._loop) this.setCursor(-1);
    else this.setPlaying(false);
  }

  private schedule(signal: AbortSignal, delay: number): void {
    this.clearTimer();
    if (!this._playing) return;
    this.timer = this.clock.setTimeout(() => {
      if (!signal.aborted) this.advance();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
