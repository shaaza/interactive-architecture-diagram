// Builds the read-only popup content for a node or an edge. Returns DOM; no event wiring
// beyond the "open another item" callback used by links between nodes and edges.

import { humanize, isRecord, type DetailsDoc, type EdgeDetails, type NodeDetails, type TypeDef, type Value } from '../details/schema';
import type { LinkRef, NodeRef } from '../types';
import { h } from './dom';

const URL_RE = /^https?:\/\/\S+$/i;

/** Renders any YAML value: text, links, lists, and nested key/value tables. */
export function renderValue(value: Value): Node {
  if (value === null || value === undefined || value === '') return h('span', { class: 'dv-empty' }, '—');
  if (typeof value === 'string') {
    if (URL_RE.test(value)) return h('a', { href: value, target: '_blank', rel: 'noopener noreferrer' }, value);
    return h('span', { class: 'dv-text' }, value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return h('code', {}, String(value));
  if (value instanceof Date) return h('span', {}, value.toISOString());
  if (Array.isArray(value)) {
    if (!value.length) return h('span', { class: 'dv-empty' }, 'None');
    return h('ul', { class: 'dv-list' }, ...value.map((v) => h('li', {}, renderValue(v))));
  }
  if (isRecord(value)) return renderTable(Object.entries(value), 'field');
  return h('span', {}, String(value));
}

/**
 * A two-column table. "field" keys are shown as written in monospace (headers, body fields);
 * "label" keys are already readable; "humanize" turns config keys into labels.
 */
function renderTable(rows: [string, Value][], keys: 'field' | 'label' | 'humanize'): HTMLElement {
  if (!rows.length) return h('span', { class: 'dv-empty' }, 'None');
  const th = (k: string) =>
    h('th', { scope: 'row', class: keys === 'field' ? 'dv-key' : '' }, keys === 'humanize' ? humanize(k) : k);
  return h('table', { class: 'dv-kv' }, h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, th(k), h('td', {}, renderValue(v))))));
}

function section(title: string, body: Node): HTMLElement {
  return h('section', { class: 'dv-section' }, h('h3', {}, title), body);
}

export interface ViewCallbacks {
  openNode(id: string): void;
  openLink(link: LinkRef): void;
}

export interface View {
  kicker: Node;
  title: string;
  subtitle: Node | null;
  body: DocumentFragment;
}

function emptyHint(what: string, key: string): HTMLElement {
  return h('p', { class: 'dv-hint' }, `No details for this ${what} yet. Add them in the Details tab under `, h('code', {}, key), '.');
}

// ---------- Nodes ----------

export function nodeView(node: NodeRef, details: NodeDetails | null, type: TypeDef | null, links: readonly LinkRef[], names: ReadonlyMap<string, string>, cb: ViewCallbacks): View {
  const body = document.createDocumentFragment();
  const badge = h('span', { class: 'dv-badge' }, type?.label ?? 'Untyped');
  if (type?.color) badge.style.setProperty('--badge', type.color);

  if (!details) body.append(emptyHint('box', `nodes: ${node.id}:`));
  if (details?.description) body.append(h('p', { class: 'dv-desc' }, details.description));

  if (details) {
    const params = { ...details.params };
    const rows: [string, Value][] = [];
    for (const f of type?.fields ?? []) {
      rows.push([f.label, params[f.key] ?? null]);
      delete params[f.key];
    }
    for (const [k, v] of Object.entries(params)) rows.push([humanize(k), v]);
    if (rows.length) body.append(section(type ? `${type.label} configuration` : 'Configuration', renderTable(rows, 'label')));
    if (details.deploy !== undefined) {
      const deploy = isRecord(details.deploy) ? renderTable(Object.entries(details.deploy), 'humanize') : renderValue(details.deploy);
      body.append(section('Deployment', deploy));
    }
  }

  const outgoing = links.filter((l) => l.fromId === node.id);
  const incoming = links.filter((l) => l.toId === node.id);
  if (outgoing.length || incoming.length) {
    const item = (l: LinkRef, dir: 'out' | 'in') => {
      const other = dir === 'out' ? l.toId : l.fromId;
      const btn = h(
        'button',
        { type: 'button', class: 'dv-link' },
        l.step ? h('span', { class: 'dv-step' }, l.step) : null,
        h('span', {}, `${dir === 'out' ? '→' : '←'} ${names.get(other) ?? other}`),
        l.title ? h('span', { class: 'dv-muted' }, l.title) : null,
      );
      btn.addEventListener('click', () => cb.openLink(l));
      return h('li', {}, btn);
    };
    body.append(section('Connections', h('ul', { class: 'dv-links' }, ...outgoing.map((l) => item(l, 'out')), ...incoming.map((l) => item(l, 'in')))));
  }

  return { kicker: withLock(badge, details?.locked), title: details?.name ?? node.name, subtitle: h('code', {}, node.id), body };
}

// ---------- Edges ----------

export function linkView(link: LinkRef, details: EdgeDetails | null, names: ReadonlyMap<string, string>, cb: ViewCallbacks): View {
  const body = document.createDocumentFragment();
  const nodeButton = (id: string) => {
    const b = h('button', { type: 'button', class: 'dv-node' }, names.get(id) ?? id);
    b.addEventListener('click', () => cb.openNode(id));
    return b;
  };
  const subtitle = h('span', { class: 'dv-route' }, nodeButton(link.fromId), h('span', { 'aria-hidden': 'true' }, ' → '), nodeButton(link.toId));

  if (details && (details.method || details.endpoint || details.protocol)) {
    body.append(
      h(
        'div',
        { class: 'dv-endpoint' },
        details.method ? h('span', { class: `dv-method dv-method-${details.method.toLowerCase()}` }, details.method) : null,
        details.endpoint ? h('code', {}, details.endpoint) : null,
        details.protocol ? h('span', { class: 'dv-muted' }, details.protocol) : null,
      ),
    );
  }
  if (!details) {
    const key = link.step ? `edges: "${link.step}":` : `edges: ${link.fromId}->${link.toId}:`;
    body.append(emptyHint('arrow', key));
  }
  if (details?.description) body.append(h('p', { class: 'dv-desc' }, details.description));
  if (details?.headers !== undefined) body.append(section('Headers', renderValue(details.headers)));
  if (details?.request !== undefined) body.append(section('Request', renderValue(details.request)));
  if (details?.response !== undefined) body.append(section('Response', renderValue(details.response)));
  for (const [k, v] of Object.entries(details?.extra ?? {})) body.append(section(humanize(k), renderValue(v)));

  const kicker = link.step ? h('span', { class: 'dv-badge dv-badge-step' }, `Step ${link.step}`) : h('span', { class: 'dv-badge' }, 'Connection');
  return { kicker: withLock(kicker, details?.locked), title: link.title || 'Unlabelled arrow', subtitle, body };
}

/** Adds a Locked badge next to the kicker for objects inserted from the toolbar. */
function withLock(kicker: HTMLElement, locked: boolean | undefined): Node {
  if (!locked) return kicker;
  const lock = h('span', { class: 'dv-badge dv-badge-lock', title: 'Inserted from the toolbar. Locked objects cannot be changed yet.' }, 'Locked');
  return h('span', { class: 'dv-kickers' }, kicker, lock);
}

export function namesFor(nodes: readonly NodeRef[], doc: DetailsDoc): Map<string, string> {
  return new Map(nodes.map((n) => [n.id, doc.nodes.get(n.id)?.name ?? n.name]));
}
