import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timeline, type PlayOptions } from '../src/play/timeline';

const PLAY_MS = 100;
const DWELL_MS = 1000;

function setup(steps = ['a', 'b', 'c']) {
  const played: string[] = [];
  const signals: AbortSignal[] = [];
  const timeline = new Timeline<string>({
    player: (step: string, _i: number, { signal }: PlayOptions) => {
      played.push(step);
      signals.push(signal);
      return new Promise<void>((resolve) => setTimeout(resolve, PLAY_MS));
    },
    dwell: () => DWELL_MS,
  });
  const cursors: number[] = [];
  timeline.on('cursor', ({ index }) => cursors.push(index));
  timeline.load(steps);
  return { timeline, played, signals, cursors };
}

describe('Timeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays each step, holds it, then advances', async () => {
    const { played, timeline } = setup();
    expect(played).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(PLAY_MS + DWELL_MS);
    expect(played).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(PLAY_MS + DWELL_MS);
    expect(played).toEqual(['a', 'b', 'c']);
    expect(timeline.cursor).toBe(2);
  });

  it('loops back through an empty frame', async () => {
    const { cursors } = setup(['a', 'b']);
    await vi.advanceTimersByTimeAsync(2 * (PLAY_MS + DWELL_MS) + 700 + 1);
    expect(cursors).toEqual([0, 1, -1, 0]);
  });

  it('stops on the last step when loop is off', async () => {
    const { timeline, cursors } = setup(['a', 'b']);
    timeline.setLoop(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cursors).toEqual([0, 1]);
    expect(timeline.playing).toBe(false);
  });

  it('play from the end restarts when loop is off', async () => {
    const { timeline } = setup(['a', 'b']);
    timeline.setLoop(false);
    await vi.advanceTimersByTimeAsync(10_000);
    timeline.play();
    expect(timeline.cursor).toBe(0);
  });

  it('scales the hold time by speed', async () => {
    const { timeline, played } = setup();
    timeline.setSpeed(2);
    await vi.advanceTimersByTimeAsync(PLAY_MS + DWELL_MS / 2);
    expect(played).toEqual(['a', 'b']);
  });

  it('manual stepping pauses and aborts the running step', async () => {
    const { timeline, signals, played } = setup();
    timeline.step(1);
    expect(timeline.playing).toBe(false);
    expect(signals[0]?.aborted).toBe(true);
    expect(played).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(played).toEqual(['a', 'b']);
  });

  it('clamps stepping between -1 and the last step', () => {
    const { timeline } = setup(['a', 'b']);
    timeline.step(-5);
    expect(timeline.cursor).toBe(-1);
    timeline.step(9);
    expect(timeline.cursor).toBe(1);
  });

  it('resumes after a pause', async () => {
    const { timeline, played } = setup();
    timeline.pause();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(played).toEqual(['a']);
    timeline.play();
    await vi.advanceTimersByTimeAsync(250);
    expect(played).toEqual(['a', 'b']);
  });

  it('load keeps a cursor within the new steps', () => {
    const { timeline } = setup(['a', 'b', 'c']);
    timeline.goTo(2);
    timeline.load(['x'], timeline.cursor);
    expect(timeline.cursor).toBe(0);
    timeline.load([], 0);
    expect(timeline.cursor).toBe(-1);
  });
});
