// The details document: node types, per-node configuration and per-edge API details.
// Written as YAML (JSON is valid YAML too) in the Details panel. Pure, no DOM.

import { load } from 'js-yaml';
import { DEFAULT_BLOCKS, typesFromBlocks } from '../blocks/library';

export type Value = unknown;
export type Dict = Record<string, Value>;

export interface FieldDef {
  key: string;
  label: string;
}

/** A node type: a display name plus the parameters it is configured with. */
export interface TypeDef {
  label: string;
  /** Badge colour in the popup, any CSS colour. */
  color?: string;
  fields: FieldDef[];
}

export interface NodeDetails {
  type?: string;
  name?: string;
  description?: string;
  /** Every other key: the node's parameters. */
  params: Dict;
  deploy?: Value;
  /** Created from the toolbar; may not be changed. */
  locked: boolean;
}

export interface EdgeDetails {
  method?: string;
  endpoint?: string;
  protocol?: string;
  description?: string;
  headers?: Value;
  request?: Value;
  response?: Value;
  /** Any other keys, shown as-is. */
  extra: Dict;
  /** Created from the toolbar; may not be changed. */
  locked: boolean;
}

export interface DetailsDoc {
  types: Map<string, TypeDef>;
  nodes: Map<string, NodeDetails>;
  /** Keyed by "From->To" (case kept) or by step number (lower case). */
  edges: Map<string, EdgeDetails>;
}

export class DetailsError extends Error {
  override name = 'DetailsError';
}

const field = (key: string, label?: string): FieldDef => ({ key, label: label ?? humanize(key) });

/** Types for the built-in blocks. The app passes the admin-configured library instead. */
export const DEFAULT_TYPES: ReadonlyMap<string, TypeDef> = typesFromBlocks(DEFAULT_BLOCKS);

/** "rateLimit" / "rate_limit" -> "Rate limit" */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isRecord(v: Value): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optString(v: Value, where: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new DetailsError(`${where} should be text.`);
}

function mapping(v: Value, where: string): Dict {
  if (v === undefined || v === null) return {};
  if (!isRecord(v)) throw new DetailsError(`${where} should be a mapping of names to values.`);
  return v;
}

function parseType(name: string, raw: Value): TypeDef {
  const where = `types.${name}`;
  const r = mapping(raw, where);
  const fieldsRaw = r.fields ?? [];
  if (!Array.isArray(fieldsRaw)) throw new DetailsError(`${where}.fields should be a list.`);
  const fields = fieldsRaw.map((f, i): FieldDef => {
    if (typeof f === 'string') return field(f);
    if (isRecord(f) && typeof f.key === 'string') return field(f.key, optString(f.label, `${where}.fields[${i}].label`));
    throw new DetailsError(`${where}.fields[${i}] should be a name, or { key, label }.`);
  });
  return { label: optString(r.label, `${where}.label`) ?? humanize(name), color: optString(r.color, `${where}.color`), fields };
}

const NODE_KEYS = new Set(['type', 'name', 'description', 'deploy', 'locked']);

function parseNode(id: string, raw: Value): NodeDetails {
  const where = `nodes.${id}`;
  const r = mapping(raw, where);
  const params: Dict = {};
  for (const [k, v] of Object.entries(r)) if (!NODE_KEYS.has(k)) params[k] = v;
  return {
    type: optString(r.type, `${where}.type`),
    name: optString(r.name, `${where}.name`),
    description: optString(r.description, `${where}.description`),
    deploy: r.deploy,
    params,
    locked: r.locked === true,
  };
}

const EDGE_KEYS = new Set(['method', 'endpoint', 'protocol', 'description', 'headers', 'request', 'response', 'locked']);

function parseEdge(key: string, raw: Value): EdgeDetails {
  const where = `edges.${key}`;
  const r = mapping(raw, where);
  const extra: Dict = {};
  for (const [k, v] of Object.entries(r)) if (!EDGE_KEYS.has(k)) extra[k] = v;
  return {
    method: optString(r.method, `${where}.method`)?.toUpperCase(),
    endpoint: optString(r.endpoint, `${where}.endpoint`),
    protocol: optString(r.protocol, `${where}.protocol`),
    description: optString(r.description, `${where}.description`),
    headers: r.headers,
    request: r.request,
    response: r.response,
    extra,
    locked: r.locked === true,
  };
}

/** "GW -> Orders" -> "GW->Orders"; "2A" -> "2a" */
export function normalizeEdgeKey(key: string): string {
  const compact = key.replace(/\s+/g, '');
  return compact.includes('->') ? compact : compact.toLowerCase();
}

const SECTIONS = new Set(['types', 'nodes', 'edges']);

export function emptyDetails(baseTypes: ReadonlyMap<string, TypeDef> = DEFAULT_TYPES): DetailsDoc {
  return { types: new Map(baseTypes), nodes: new Map(), edges: new Map() };
}

/** Parses the Details panel. Throws DetailsError with a readable message. */
export function parseDetails(text: string, baseTypes: ReadonlyMap<string, TypeDef> = DEFAULT_TYPES): DetailsDoc {
  const doc = emptyDetails(baseTypes);
  if (!text.trim()) return doc;

  let raw: Value;
  try {
    raw = load(text);
  } catch (err) {
    throw new DetailsError(err instanceof Error ? err.message : String(err));
  }
  if (raw === undefined || raw === null) return doc;
  const top = mapping(raw, 'The details document');
  for (const key of Object.keys(top)) {
    if (!SECTIONS.has(key)) throw new DetailsError(`Unknown section "${key}". Use types, nodes or edges.`);
  }

  for (const [name, def] of Object.entries(mapping(top.types, 'types'))) doc.types.set(name, parseType(name, def));
  for (const [id, node] of Object.entries(mapping(top.nodes, 'nodes'))) doc.nodes.set(id, parseNode(id, node));
  for (const [key, edge] of Object.entries(mapping(top.edges, 'edges'))) doc.edges.set(normalizeEdgeKey(key), parseEdge(key, edge));
  return doc;
}

export function resolveType(doc: DetailsDoc, name: string | undefined): TypeDef | null {
  if (!name) return null;
  return doc.types.get(name) ?? { label: humanize(name), fields: [] };
}

/** Details for an edge: an exact "From->To" entry wins over its step number. */
export function findEdgeDetails(
  doc: DetailsDoc,
  edge: { fromId: string; toId: string; step: string | null },
): EdgeDetails | null {
  return (
    doc.edges.get(normalizeEdgeKey(`${edge.fromId}->${edge.toId}`)) ??
    (edge.step ? doc.edges.get(normalizeEdgeKey(edge.step)) : undefined) ??
    null
  );
}
