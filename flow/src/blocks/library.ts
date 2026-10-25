// The block library: the kinds of object people can insert from the toolbar and
// configure in the admin view. Pure data and validation; no DOM, no storage.

export type BlockKind = 'node' | 'edge';

/** Mermaid flowchart node shapes a block can draw with. */
export const SHAPES = {
  rect: { label: 'Rectangle', open: '[', close: ']' },
  round: { label: 'Rounded', open: '(', close: ')' },
  stadium: { label: 'Stadium', open: '([', close: '])' },
  cylinder: { label: 'Cylinder', open: '[(', close: ')]' },
  subroutine: { label: 'Double-sided', open: '[[', close: ']]' },
  circle: { label: 'Circle', open: '((', close: '))' },
  hexagon: { label: 'Hexagon', open: '{{', close: '}}' },
  parallelogram: { label: 'Parallelogram', open: '[/', close: '/]' },
  asymmetric: { label: 'Flag', open: '>', close: ']' },
} as const;
export type Shape = keyof typeof SHAPES;

/** Icons the toolbar can show. Drawn by ui/icons.ts. */
export const ICONS = ['service', 'database', 'cache', 'queue', 'worker', 'gateway', 'client', 'external', 'api', 'box'] as const;
export type IconName = (typeof ICONS)[number];

export interface BlockField {
  key: string;
  label: string;
  /** Pre-filled in the insert form. YAML is allowed: "{ a: 1 }" becomes a mapping. */
  default?: string;
}

export interface BlockDef {
  /** The type name written into the details, e.g. "service". Unique. */
  type: string;
  label: string;
  kind: BlockKind;
  /** Node blocks only. */
  shape?: Shape;
  icon: IconName;
  /** Badge colour in popups, any CSS colour. */
  color?: string;
  fields: BlockField[];
}

const f = (key: string, label: string, def?: string): BlockField => (def === undefined ? { key, label } : { key, label, default: def });

export const DEFAULT_BLOCKS: readonly BlockDef[] = [
  {
    type: 'api', label: 'API call', kind: 'edge', icon: 'api',
    fields: [
      f('method', 'Method', 'GET'), f('endpoint', 'Endpoint', '/'), f('protocol', 'Protocol', 'HTTPS'),
      f('description', 'Description'), f('headers', 'Headers', '{ Content-Type: application/json }'),
      f('request', 'Request'), f('response', 'Response', '{ status: 200 OK }'),
    ],
  },
  { type: 'service', label: 'Service', kind: 'node', shape: 'rect', icon: 'service',
    fields: [f('language', 'Language'), f('framework', 'Framework'), f('owner', 'Owner'), f('repo', 'Repository')] },
  { type: 'database', label: 'Database', kind: 'node', shape: 'cylinder', icon: 'database',
    fields: [f('engine', 'Engine', 'PostgreSQL'), f('version', 'Version'), f('storage', 'Storage'), f('backups', 'Backups')] },
  { type: 'cache', label: 'Cache', kind: 'node', shape: 'cylinder', icon: 'cache',
    fields: [f('engine', 'Engine', 'Redis'), f('ttl', 'TTL'), f('eviction', 'Eviction', 'allkeys-lru')] },
  { type: 'queue', label: 'Queue', kind: 'node', shape: 'subroutine', icon: 'queue',
    fields: [f('broker', 'Broker'), f('topic', 'Topic'), f('partitions', 'Partitions'), f('retention', 'Retention')] },
  { type: 'worker', label: 'Worker', kind: 'node', shape: 'parallelogram', icon: 'worker',
    fields: [f('language', 'Language'), f('trigger', 'Trigger'), f('concurrency', 'Concurrency'), f('owner', 'Owner')] },
  { type: 'gateway', label: 'API gateway', kind: 'node', shape: 'rect', icon: 'gateway',
    fields: [f('product', 'Product'), f('auth', 'Auth'), f('rateLimit', 'Rate limit'), f('owner', 'Owner')] },
  { type: 'client', label: 'Client', kind: 'node', shape: 'circle', icon: 'client',
    fields: [f('platform', 'Platform'), f('auth', 'Auth')] },
  { type: 'external', label: 'External service', kind: 'node', shape: 'hexagon', icon: 'external',
    fields: [f('vendor', 'Vendor'), f('docs', 'Documentation'), f('sla', 'SLA')] },
];

export class LibraryError extends Error {
  override name = 'LibraryError';
}

const TYPE_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
/** Keys the details format gives a meaning of its own. */
const RESERVED_NODE_KEYS = new Set(['type', 'name', 'description', 'deploy', 'locked']);

/** Checks one block definition. Returns a list of problems, empty when valid. */
export function blockProblems(block: BlockDef): string[] {
  const problems: string[] = [];
  const name = block.label || block.type || 'This block';
  if (!TYPE_RE.test(block.type)) problems.push(`${name}: the type name must start with a lower-case letter and use only a-z, 0-9, - and _.`);
  if (!block.label.trim()) problems.push(`${name}: give it a label.`);
  if (block.kind !== 'node' && block.kind !== 'edge') problems.push(`${name}: kind must be box or arrow.`);
  if (block.kind === 'node' && !(block.shape && block.shape in SHAPES)) problems.push(`${name}: choose a shape.`);
  if (!(ICONS as readonly string[]).includes(block.icon)) problems.push(`${name}: choose an icon.`);
  const seen = new Set<string>();
  for (const field of block.fields) {
    if (!KEY_RE.test(field.key)) problems.push(`${name}: field "${field.key}" needs a key of letters, digits, - and _.`);
    else if (seen.has(field.key)) problems.push(`${name}: field "${field.key}" appears twice.`);
    else if (block.kind === 'node' && RESERVED_NODE_KEYS.has(field.key)) problems.push(`${name}: "${field.key}" is reserved; use another field key.`);
    seen.add(field.key);
  }
  return problems;
}

/** Validates a whole library. Throws LibraryError listing every problem. */
export function validateLibrary(blocks: readonly BlockDef[]): void {
  const problems = blocks.flatMap(blockProblems);
  const types = new Set<string>();
  for (const b of blocks) {
    if (types.has(b.type)) problems.push(`Two blocks use the type name "${b.type}".`);
    types.add(b.type);
  }
  if (problems.length) throw new LibraryError(problems.join('\n'));
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Reads a library back from storage, dropping anything malformed. */
export function parseLibrary(raw: unknown): BlockDef[] {
  if (!Array.isArray(raw)) throw new LibraryError('Saved blocks are not a list.');
  const blocks = raw.map((r): BlockDef => {
    const o = (r ?? {}) as Record<string, unknown>;
    const fields = Array.isArray(o.fields) ? o.fields : [];
    return {
      type: str(o.type) ?? '',
      label: str(o.label) ?? '',
      kind: o.kind === 'edge' ? 'edge' : 'node',
      shape: str(o.shape) as Shape | undefined,
      icon: (str(o.icon) ?? 'box') as IconName,
      color: str(o.color) || undefined,
      fields: fields.map((x) => {
        const fo = (x ?? {}) as Record<string, unknown>;
        const def = str(fo.default);
        return { key: str(fo.key) ?? '', label: str(fo.label) ?? '', ...(def !== undefined ? { default: def } : {}) };
      }),
    };
  });
  validateLibrary(blocks);
  return blocks;
}

/** A fresh, editable copy of the built-in blocks. */
export function defaultLibrary(): BlockDef[] {
  return structuredClone(DEFAULT_BLOCKS) as BlockDef[];
}

/** The node blocks as details types: what the popups use to label and order parameters. */
export function typesFromBlocks(blocks: readonly BlockDef[]): Map<string, { label: string; color?: string; fields: { key: string; label: string }[] }> {
  return new Map(
    blocks
      .filter((b) => b.kind === 'node')
      .map((b) => [b.type, { label: b.label, ...(b.color ? { color: b.color } : {}), fields: b.fields.map(({ key, label }) => ({ key, label })) }]),
  );
}
