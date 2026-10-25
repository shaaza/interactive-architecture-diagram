// Renderer-independent helpers for binding numbered edges to SVG elements.

import { compareKeys, squash } from '../parse/steps';
import type { EdgeRef, MarkerAttr, MarkerVariants, StepGroup } from '../types';

interface Point {
  x: number;
  y: number;
}

/** Screen position of a path's midpoint, or null if it is not laid out. */
export function pathMidpointOnScreen(path: SVGPathElement, length: number): Point | null {
  const mid = path.getPointAtLength(length / 2);
  const ctm = path.getScreenCTM();
  if (!ctm) return null;
  return { x: mid.x * ctm.a + mid.y * ctm.c + ctm.e, y: mid.x * ctm.b + mid.y * ctm.d + ctm.f };
}

function centerOf(el: Element): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Picks the unused label whose text matches, nearest to the anchor point,
 * and marks it as used.
 */
export function claimLabel(
  labels: readonly Element[],
  used: Set<Element>,
  text: string,
  anchor: Point | null,
): Element | null {
  const want = squash(text);
  let best: Element | null = null;
  let bestDistance = Infinity;
  for (const label of labels) {
    if (used.has(label) || squash(label.textContent) !== want) continue;
    const c = centerOf(label);
    const d = anchor ? Math.hypot(c.x - anchor.x, c.y - anchor.y) : 0;
    if (d < bestDistance) {
      bestDistance = d;
      best = label;
    }
  }
  if (best) used.add(best);
  return best;
}

const MARKER_ATTRS: readonly MarkerAttr[] = ['marker-end', 'marker-start'];

/** Copies each arrowhead marker on the path into "active" and "done" colourways. */
export function prepareMarkers(svg: SVGSVGElement, path: SVGPathElement): EdgeRef['markers'] {
  const out: EdgeRef['markers'] = {};
  for (const attr of MARKER_ATTRS) {
    const value = path.getAttribute(attr);
    const id = value ? /url\(#([^)]+)\)/.exec(value)?.[1] : undefined;
    if (!value || !id) continue;
    const base = svg.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!base?.parentNode) continue;
    const variants: MarkerVariants = { original: value, active: value, done: value };
    for (const kind of ['active', 'done'] as const) {
      const copyId = `${id}__${kind}`;
      if (!svg.querySelector(`[id="${CSS.escape(copyId)}"]`)) {
        const copy = base.cloneNode(true) as Element;
        copy.id = copyId;
        const color = `var(--flow-${kind})`;
        copy.querySelectorAll<SVGElement>('path, circle, polygon').forEach((shape) => {
          shape.style.setProperty('fill', color, 'important');
          shape.style.setProperty('stroke', color, 'important');
        });
        base.parentNode.appendChild(copy);
      }
      variants[kind] = `url(#${copyId})`;
    }
    out[attr] = variants;
  }
  return out;
}

export interface NumberedEdge {
  key: string;
  label: string;
  edge: EdgeRef;
}

/** Groups edges by step key, sorted in step order, with narration attached. */
export function groupSteps(edges: readonly NumberedEdge[], narration: ReadonlyMap<string, string>): StepGroup[] {
  const groups = new Map<string, StepGroup>();
  for (const { key, label, edge } of edges) {
    let group = groups.get(key);
    if (!group) {
      group = { key, label, narration: narration.get(key) ?? '', edges: [] };
      groups.set(key, group);
    }
    group.edges.push(edge);
  }
  return [...groups.values()].sort((a, b) => compareKeys(a.key, b.key));
}
