// How edges look in each state, and the effects that bring a step on screen.

import type { EdgeRef, EdgeState, Effect, EffectContext, Scene, StepGroup } from '../types';

const SVGNS = 'http://www.w3.org/2000/svg';
const TRANSIENT = '.fa-trace, .fa-dot, .fa-halo';

export function setEdgeState(edge: EdgeRef, state: EdgeState): void {
  for (const el of [edge.path, edge.label]) {
    if (!el) continue;
    el.classList.toggle('fa-hidden', state === 'hidden');
    el.classList.toggle('fa-done', state === 'done');
    el.classList.toggle('fa-active', state === 'active');
  }
  for (const [attr, v] of Object.entries(edge.markers)) {
    edge.path.setAttribute(attr, state === 'active' ? v.active : state === 'done' ? v.done : v.original);
  }
}

function highlight(node: Element | null): void {
  node?.classList.add('fa-node-active');
}

/** Puts every step before `cursor` in the done state and hides the rest. */
export function applyStates(scene: Scene, cursor: number): void {
  scene.svg.querySelectorAll(TRANSIENT).forEach((n) => n.remove());
  scene.svg.querySelectorAll('.fa-node-active').forEach((n) => n.classList.remove('fa-node-active'));
  scene.steps.forEach((step, i) => {
    for (const edge of step.edges) setEdgeState(edge, i < cursor ? 'done' : 'hidden');
  });
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Shows the edge in its active state immediately. */
export const instantEffect: Effect = {
  name: 'instant',
  enter(edge) {
    setEdgeState(edge, 'active');
    highlight(edge.from);
    highlight(edge.to);
    return Promise.resolve();
  },
};

/** Draws the edge along its path behind a travelling dot; the label appears at the midpoint. */
export const drawEffect: Effect = {
  name: 'draw',
  enter(edge: EdgeRef, { signal, speed }: EffectContext): Promise<void> {
    return new Promise((resolve) => {
      const { path, length } = edge;
      const parent = path.parentNode;
      if (signal.aborted || !parent) {
        resolve();
        return;
      }
      const duration = Math.max(650, Math.min(1700, length * 2.4)) / speed;

      const trace = svgEl('path', { d: path.getAttribute('d') ?? '', class: 'fa-trace' });
      trace.style.strokeDasharray = `${length} ${length}`;
      trace.style.strokeDashoffset = String(length);
      const halo = svgEl('circle', { class: 'fa-halo', r: '11' });
      const dot = svgEl('circle', { class: 'fa-dot', r: '5.5' });
      parent.append(trace, halo, dot);

      const cleanup = () => {
        trace.remove();
        halo.remove();
        dot.remove();
      };
      signal.addEventListener('abort', () => { cleanup(); resolve(); }, { once: true });

      highlight(edge.from);
      let labelShown = false;
      const t0 = performance.now();

      const frame = (now: number) => {
        if (signal.aborted) return;
        const t = Math.min(1, (now - t0) / duration);
        const k = ease(t);
        trace.style.strokeDashoffset = String(length * (1 - k));
        const pt = path.getPointAtLength(length * k);
        for (const c of [dot, halo]) {
          c.setAttribute('cx', String(pt.x));
          c.setAttribute('cy', String(pt.y));
        }
        halo.setAttribute('r', String(9 + 4 * Math.sin(now / 90)));
        if (!labelShown && k >= 0.45 && edge.label) {
          labelShown = true;
          edge.label.classList.remove('fa-hidden');
          edge.label.classList.add('fa-active');
        }
        if (t < 1) {
          requestAnimationFrame(frame);
          return;
        }
        setEdgeState(edge, 'active');
        highlight(edge.to);
        trace.remove();
        halo.remove();
        dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => dot.remove();
        resolve();
      };
      requestAnimationFrame(frame);
    });
  },
};

const effects = new Map<string, Effect>();

export function registerEffect(effect: Effect): void {
  effects.set(effect.name, effect);
}

export function getEffect(name: string): Effect {
  return effects.get(name) ?? drawEffect;
}

registerEffect(instantEffect);
registerEffect(drawEffect);

export interface PlayStepOptions extends EffectContext {
  animate: boolean;
  reduceMotion: boolean;
}

/** Plays every edge of a step together. */
export async function playStep(step: StepGroup, opts: PlayStepOptions): Promise<void> {
  const effect = getEffect(opts.animate && !opts.reduceMotion ? 'draw' : 'instant');
  await Promise.all(step.edges.map((edge) => effect.enter(edge, opts)));
}

/** Hold time after a step, at 1x speed: longer for more words to read. */
export function dwellFor(step: StepGroup): number {
  const text = step.edges.map((e) => e.title).join(' ') + ' ' + step.narration;
  return 900 + Math.min(text.split(/\s+/).length * 140, 3200);
}
