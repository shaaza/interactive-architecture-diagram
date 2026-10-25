// Objects inserted from the toolbar are locked: their details entry carries
// `locked: true`, and neither it nor the Mermaid line that draws the object
// may change. This module finds locked objects and reports changes to them.

import { load } from 'js-yaml';
import { normalizeEdgeKey } from '../details/schema';
import type { Snapshot } from '../history/repository';

interface Locked {
  label: string;
  fingerprint: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mermaid lines that declare a node: "ID[...]", "ID((...))" and so on. */
function nodeLines(source: string, id: string): string[] {
  const re = new RegExp(`^${escape(id)}\\s*[[({>]`);
  return source.split('\n').map((l) => l.trim()).filter((l) => re.test(l));
}

/** Mermaid lines that draw an edge from one node to another. */
function edgeLines(source: string, from: string, to: string): string[] {
  const re = new RegExp(`^${escape(from)}\\s*(--|==|-\\.|<-).*\\s${escape(to)}$`);
  return source.split('\n').map((l) => l.trim()).filter((l) => re.test(l));
}

/** Every locked object in a snapshot, keyed by "node:ID" or "edge:From->To". Null if the details cannot be read. */
export function lockedObjects(snapshot: Snapshot): Map<string, Locked> | null {
  let raw: unknown;
  try {
    raw = snapshot.details.trim() ? load(snapshot.details) : {};
  } catch {
    return null;
  }
  const out = new Map<string, Locked>();
  if (!isRecord(raw)) return raw === null || raw === undefined ? out : null;
  for (const [id, entry] of Object.entries(isRecord(raw.nodes) ? raw.nodes : {})) {
    if (isRecord(entry) && entry.locked === true) {
      out.set(`node:${id}`, { label: id, fingerprint: JSON.stringify([entry, nodeLines(snapshot.source, id)]) });
    }
  }
  for (const [key, entry] of Object.entries(isRecord(raw.edges) ? raw.edges : {})) {
    const norm = normalizeEdgeKey(key);
    const [from, to] = norm.split('->');
    if (isRecord(entry) && entry.locked === true && from && to) {
      out.set(`edge:${norm}`, { label: `${from} → ${to}`, fingerprint: JSON.stringify([entry, edgeLines(snapshot.source, from, to)]) });
    }
  }
  return out;
}

/** Locked objects in `before` that `after` changes or removes, as readable sentences. */
export function lockViolations(before: Snapshot, after: Snapshot): string[] {
  const was = lockedObjects(before);
  if (!was || was.size === 0) return [];
  const now = lockedObjects(after);
  if (!now) return ['The details have errors, so locked objects cannot be checked.'];
  const problems: string[] = [];
  for (const [key, obj] of was) {
    const kind = key.startsWith('node:') ? 'Box' : 'Arrow';
    const next = now.get(key);
    if (!next) problems.push(`${kind} ${obj.label} is locked and was removed or unlocked.`);
    else if (next.fingerprint !== obj.fingerprint) problems.push(`${kind} ${obj.label} is locked and was changed.`);
  }
  return problems;
}
