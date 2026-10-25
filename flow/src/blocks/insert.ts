// Inserts toolbar blocks into the diagram source and the details document.
// Pure text-in, text-out. The details are edited as text so the user's
// comments and layout survive; only a JSON document is re-serialised.

import { dump, load } from 'js-yaml';
import type { Snapshot } from '../history/repository';
import { normalizeEdgeKey } from '../details/schema';
import { SHAPES, type BlockDef } from './library';

export class InsertError extends Error {
  override name = 'InsertError';
}

export interface NodeInsert {
  block: BlockDef;
  id: string;
  label: string;
  /** Field key -> text typed in the form. */
  values: Record<string, string>;
}

export interface EdgeInsert {
  block: BlockDef;
  from: string;
  to: string;
  /** Step number such as "4", or null for an arrow outside the flow. */
  step: string | null;
  label: string;
  values: Record<string, string>;
}

const ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const MERMAID_WORDS = new Set(['end', 'graph', 'flowchart', 'subgraph', 'click', 'style', 'class', 'classDef', 'linkStyle', 'direction', 'default']);

/** A readable unused id from a label: "Order service" -> "OrderService", then "OrderService2". */
export function suggestId(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .replace(/[^A-Za-z0-9 ]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')
      .replace(/^[0-9]+/, '')
      .replace(/^[a-z]/, (c) => c.toUpperCase()) || 'Node';
  if (!taken.has(base) && !MERMAID_WORDS.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(base + i)) return base + i;
}

/** The next free step number: one more than the highest numbered edge label. */
export function nextStep(source: string): string {
  let max = 0;
  for (const m of source.matchAll(/(?:\||"|--|==|-\.)\s*"?(\d+)(?:[.)]|#46;|#41;)/g)) max = Math.max(max, Number(m[1]));
  return String(max + 1);
}

/** Single-line text stays text; text starting with { or [, or spanning lines, is read as YAML. */
export function parseFieldValue(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  if (/^[{[]/.test(t) || t.includes('\n')) {
    try {
      return load(t);
    } catch {
      throw new InsertError(`This value is not valid YAML: ${t.slice(0, 60)}`);
    }
  }
  return t;
}

function fieldValues(block: BlockDef, values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of block.fields) {
    const v = parseFieldValue(values[field.key] ?? '');
    if (v !== undefined) out[field.key] = v;
  }
  return out;
}

/** Mermaid label text in quotes, safe from Mermaid's syntax. */
function quote(label: string): string {
  return '"' + label.replace(/"/g, '#quot;').replace(/\n/g, ' ') + '"';
}

function appendLine(source: string, line: string): string {
  return source.replace(/\s*$/, '') + '\n' + line + '\n';
}

function rawDetails(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  let raw: unknown;
  try {
    raw = load(text);
  } catch {
    throw new InsertError('Fix the errors in the Details tab before inserting.');
  }
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new InsertError('Fix the errors in the Details tab before inserting.');
  return raw as Record<string, unknown>;
}

/**
 * Adds `key: value` to a top-level section (nodes or edges) of the details text,
 * creating the section if needed, without disturbing the rest of the text.
 */
export function appendEntry(text: string, section: 'nodes' | 'edges', key: string, value: Record<string, unknown>): string {
  const raw = rawDetails(text);
  const current = raw[section];
  if (current !== undefined && current !== null && (typeof current !== 'object' || Array.isArray(current))) {
    throw new InsertError(`The "${section}" section in the Details tab is not a mapping.`);
  }

  // JSON documents are re-serialised as JSON.
  if (text.trim().startsWith('{')) {
    const next = { ...raw, [section]: { ...(current as object | null), [key]: value } };
    return JSON.stringify(next, null, 2) + '\n';
  }

  const block = dump({ [key]: value }, { lineWidth: -1 })
    .trimEnd()
    .split('\n')
    .map((l) => '  ' + l);
  const lines = text.replace(/\s*$/, '').split('\n');
  const start = lines.findIndex((l) => new RegExp(`^${section}:\\s*(#.*)?$`).test(l));

  if (start === -1) {
    // No block-style section yet. An inline one ("nodes: {}") is replaced.
    const inline = lines.findIndex((l) => new RegExp(`^${section}:`).test(l));
    if (inline !== -1) {
      if (current && Object.keys(current).length) {
        const next = { ...raw, [section]: { ...(current as object), [key]: value } };
        return dump(next, { lineWidth: -1 });
      }
      lines.splice(inline, 1, `${section}:`, ...block);
      return lines.join('\n') + '\n';
    }
    const prefix = text.trim() ? lines.join('\n') + '\n\n' : '';
    return `${prefix}${section}:\n${block.join('\n')}\n`;
  }

  // The section ends at the next top-level key; insert before any blank lines that precede it.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[^\s#]/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  while (end > start + 1 && !(lines[end - 1] ?? '').trim()) end--;
  lines.splice(end, 0, ...block);
  return lines.join('\n') + '\n';
}

export function insertNode(snapshot: Snapshot, ins: NodeInsert, takenIds: ReadonlySet<string>): Snapshot {
  if (ins.block.kind !== 'node') throw new InsertError(`${ins.block.label} is not a box.`);
  const id = ins.id.trim();
  if (!ID_RE.test(id)) throw new InsertError('The ID must start with a letter and use only letters, digits and _.');
  if (MERMAID_WORDS.has(id)) throw new InsertError(`"${id}" is a Mermaid keyword; choose another ID.`);
  if (takenIds.has(id)) throw new InsertError(`A box with the ID "${id}" already exists.`);
  const label = ins.label.trim() || id;
  const shape = SHAPES[ins.block.shape ?? 'rect'];
  const line = `  ${id}${shape.open}${quote(label)}${shape.close}`;
  const entry = { type: ins.block.type, ...fieldValues(ins.block, ins.values), locked: true };
  return { source: appendLine(snapshot.source, line), details: appendEntry(snapshot.details, 'nodes', id, entry) };
}

export function insertEdge(snapshot: Snapshot, ins: EdgeInsert): Snapshot {
  if (ins.block.kind !== 'edge') throw new InsertError(`${ins.block.label} is not an arrow.`);
  if (ins.from === ins.to) throw new InsertError('Choose two different boxes.');
  const step = ins.step?.trim() || null;
  if (step && !/^\d+[a-z]?(\.\d+)*$/i.test(step)) throw new InsertError('The step must be a number such as 4, 4.1 or 4a.');
  const key = `${ins.from}->${ins.to}`;
  const edges = rawDetails(snapshot.details).edges;
  if (edges && typeof edges === 'object' && Object.keys(edges).some((k) => normalizeEdgeKey(k) === key)) {
    throw new InsertError(`An arrow from ${ins.from} to ${ins.to} already has details.`);
  }
  const text = [step ? `${step}.` : '', ins.label.trim()].filter(Boolean).join(' ');
  const line = `  ${ins.from} -->${text ? `|${quote(text)}|` : ''} ${ins.to}`;
  const entry = { ...fieldValues(ins.block, ins.values), locked: true };
  return { source: appendLine(snapshot.source, line), details: appendEntry(snapshot.details, 'edges', key, entry) };
}
