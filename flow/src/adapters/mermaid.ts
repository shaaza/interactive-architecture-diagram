// The only module that knows about Mermaid. Mermaid is loaded from the CDN as
// a global; its internal parser API is untyped, so it is narrowed here once.

import type { MermaidConfig } from 'mermaid';
import { escapeNumbered, parseStepLabel, plainText, readNarration } from '../parse/steps';
import { claimLabel, groupSteps, pathMidpointOnScreen, prepareMarkers, type NumberedEdge } from '../scene/bind';
import {
  DiagramError,
  type Adapter,
  type EdgeRef,
  type LinkRef,
  type NodeRef,
  type RenderedDiagram,
  type Scene,
  type Theme,
} from '../types';

/** The fields of Mermaid's internal flowchart edge that this adapter reads. */
interface FlowEdge {
  id?: string;
  start: string;
  end: string;
  text: string;
}

interface ParsedDiagram {
  type: string;
  db: { getEdges?: () => unknown[] };
}

interface MermaidGlobal {
  initialize(config: MermaidConfig): void;
  render(id: string, text: string): Promise<{ svg: string }>;
  mermaidAPI: { getDiagramFromText(text: string): Promise<ParsedDiagram> };
}

declare global {
  interface Window {
    mermaid?: MermaidGlobal;
  }
}

function getMermaid(): MermaidGlobal {
  if (!window.mermaid) throw new DiagramError('The Mermaid library did not load. Check your connection and reload the page.');
  return window.mermaid;
}

function isFlowEdge(e: unknown): e is FlowEdge {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return typeof r.start === 'string' && typeof r.end === 'string';
}

function toFlowEdges(raw: unknown[]): FlowEdge[] {
  return raw.filter(isFlowEdge).map((e) => ({ ...e, text: typeof e.text === 'string' ? e.text : '' }));
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const r = err as { message?: unknown; str?: unknown };
    const msg = typeof r.message === 'string' ? r.message : typeof r.str === 'string' ? r.str : '';
    if (msg) return msg.replace(/^Error:\s*/, '').trim();
  }
  return String(err);
}

let configuredFor = '';

function configure(theme: Theme): void {
  const key = JSON.stringify(theme);
  if (key === configuredFor) return;
  configuredFor = key;
  getMermaid().initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: theme.fontFamily,
    flowchart: { curve: 'basis', padding: 12, nodeSpacing: 36, rankSpacing: 52, htmlLabels: true },
    themeVariables: {
      fontFamily: theme.fontFamily,
      fontSize: '14px',
      background: theme.bg,
      primaryColor: theme.node,
      primaryBorderColor: theme.nodeBorder,
      primaryTextColor: theme.ink,
      secondaryColor: theme.cluster,
      tertiaryColor: theme.cluster,
      clusterBkg: theme.cluster,
      clusterBorder: theme.rule,
      titleColor: theme.muted,
      lineColor: theme.nodeBorder,
      textColor: theme.ink,
      edgeLabelBackground: theme.panel,
    },
  });
}

const NODE_ID_RE = /(?:^|-)flowchart-(.+)-\d+$/;

/** Reads the source id of a rendered Mermaid node. */
function nodeId(g: Element): string | null {
  return g.getAttribute('data-id') ?? NODE_ID_RE.exec(g.id)?.[1] ?? null;
}

function collectNodes(svg: SVGSVGElement): NodeRef[] {
  const nodes: NodeRef[] = [];
  for (const el of svg.querySelectorAll('g.node')) {
    const id = nodeId(el);
    if (id) nodes.push({ id, el, name: plainText(el.textContent) || id });
  }
  return nodes;
}

function findPath(svg: SVGSVGElement, edge: FlowEdge, fallback: Element | undefined): SVGPathElement | null {
  const byId = edge.id
    ? svg.querySelector(`[id="${CSS.escape(edge.id)}"]`) ?? svg.querySelector(`path[data-id="${CSS.escape(edge.id)}"]`)
    : null;
  const el = byId ?? fallback;
  return el instanceof SVGPathElement ? el : null;
}

function bindEdges(svg: SVGSVGElement, edges: readonly FlowEdge[], nodes: readonly NodeRef[], narration: ReadonlyMap<string, string>) {
  const allPaths = [...new Set(svg.querySelectorAll('.edgePaths path, path.flowchart-link'))];
  const labels = [...svg.querySelectorAll('g.edgeLabel')];
  const nodeById = new Map(nodes.map((n) => [n.id, n.el]));
  const usedLabels = new Set<Element>();
  const numbered: NumberedEdge[] = [];
  const links: LinkRef[] = [];

  edges.forEach((flowEdge, i) => {
    const path = findPath(svg, flowEdge, allPaths[i]);
    if (!path) return;
    const step = parseStepLabel(flowEdge.text);
    const length = path.getTotalLength();
    const text = plainText(flowEdge.text);
    const label = text ? claimLabel(labels, usedLabels, flowEdge.text, pathMidpointOnScreen(path, length)) : null;
    links.push({ path, label, fromId: flowEdge.start, toId: flowEdge.end, title: step?.title ?? text, step: step?.label ?? null });

    if (!step) {
      path.classList.add('fa-static');
      return;
    }
    const edge: EdgeRef = {
      path,
      label,
      length,
      title: step.title,
      from: nodeById.get(flowEdge.start) ?? null,
      to: nodeById.get(flowEdge.end) ?? null,
      markers: prepareMarkers(svg, path),
    };
    path.classList.add('fa-fade');
    label?.classList.add('fa-fade');
    numbered.push({ key: step.key, label: step.label, edge });
  });

  return { steps: groupSteps(numbered, narration), links };
}

let renderCount = 0;

export const mermaidAdapter: Adapter = {
  id: 'mermaid',

  // Mermaid is the fallback: any text is handed to it, and it reports errors.
  canHandle: () => true,

  async render(src: string, theme: Theme): Promise<RenderedDiagram> {
    const mermaid = getMermaid();
    configure(theme);

    // Parse the original text for edge data; render the escaped text for display.
    let parsed: ParsedDiagram;
    try {
      parsed = await mermaid.mermaidAPI.getDiagramFromText(src);
    } catch (err) {
      throw new DiagramError(errorMessage(err));
    }
    const rawEdges = typeof parsed.db.getEdges === 'function' ? parsed.db.getEdges() : null;
    const edges = rawEdges ? toFlowEdges(rawEdges) : null;

    const renderId = `mfa-${++renderCount}`;
    let svgMarkup: string;
    try {
      ({ svg: svgMarkup } = await mermaid.render(renderId, escapeNumbered(src)));
    } catch (err) {
      document.getElementById(`d${renderId}`)?.remove();
      throw new DiagramError(errorMessage(err));
    }

    return {
      mount(host: HTMLElement): Scene {
        host.innerHTML = svgMarkup;
        const svg = host.querySelector('svg');
        if (!svg) throw new DiagramError('Mermaid returned no diagram.');
        svg.removeAttribute('height');
        svg.setAttribute('width', '100%');
        svg.style.maxWidth = 'none';
        if (!edges) {
          return {
            svg, steps: [], nodes: [], links: [],
            notice: 'Only flowchart and graph diagrams animate. This one is shown as a still image.',
          };
        }
        const nodes = collectNodes(svg);
        return { svg, nodes, ...bindEdges(svg, edges, nodes, readNarration(src)) };
      },
    };
  },
};
