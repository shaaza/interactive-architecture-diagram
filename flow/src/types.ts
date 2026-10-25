// Shared contracts between the pipeline stages:
// source text -> Adapter -> Scene -> Timeline -> Effects + UI

export type EdgeState = 'hidden' | 'active' | 'done';

export type MarkerAttr = 'marker-start' | 'marker-end';

/** The original marker URL plus a recoloured copy for each visible state. */
export interface MarkerVariants {
  original: string;
  active: string;
  done: string;
}

/** One numbered edge, bound to the SVG elements that draw it. */
export interface EdgeRef {
  path: SVGPathElement;
  label: Element | null;
  from: Element | null;
  to: Element | null;
  /** Label text without the step number, e.g. "Request". */
  title: string;
  /** Total path length, cached for animation. */
  length: number;
  markers: Partial<Record<MarkerAttr, MarkerVariants>>;
}

/** All edges that share a step number. They play together. */
export interface StepGroup {
  /** Normalised sort key, e.g. "2a". */
  key: string;
  /** The number as written, e.g. "2a". */
  label: string;
  narration: string;
  edges: EdgeRef[];
}

/** A box in the diagram. */
export interface NodeRef {
  /** The id used in the source, e.g. "GW". */
  id: string;
  el: Element;
  /** The text shown in the box. */
  name: string;
}

/** Any edge in the diagram, numbered or not. Used for clicks and lookups. */
export interface LinkRef {
  path: SVGPathElement;
  label: Element | null;
  fromId: string;
  toId: string;
  /** Label text without the step number. Empty when the edge has no label. */
  title: string;
  /** The step number as written, or null for an unnumbered edge. */
  step: string | null;
}

/** A mounted diagram ready to play. */
export interface Scene {
  svg: SVGSVGElement;
  steps: StepGroup[];
  nodes: NodeRef[];
  links: LinkRef[];
  /** Set when the diagram rendered but cannot animate. */
  notice?: string;
}

/** Colours read from the page's CSS tokens, handed to the renderer. */
export interface Theme {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  rule: string;
  node: string;
  nodeBorder: string;
  cluster: string;
  fontFamily: string;
}

/** A rendered diagram that has not been attached to the page yet. */
export interface RenderedDiagram {
  /** Replace the host's content with the diagram and bind its steps. */
  mount(host: HTMLElement): Scene;
}

/** Turns diagram source text into a rendered diagram. */
export interface Adapter {
  id: string;
  canHandle(src: string): boolean;
  /** Throws a DiagramError when the source cannot be rendered. */
  render(src: string, theme: Theme): Promise<RenderedDiagram>;
}

export class DiagramError extends Error {
  override name = 'DiagramError';
}

export interface EffectContext {
  signal: AbortSignal;
  speed: number;
}

/** Brings one edge on screen for its step. Resolves when finished or aborted. */
export interface Effect {
  name: string;
  enter(edge: EdgeRef, ctx: EffectContext): Promise<void>;
}
