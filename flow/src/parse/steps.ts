// Pure text helpers for step labels and narration. No DOM access.

/** "1. Do X", "2) Do Y", "3: Do Z", "1.2 Sub-step", "2a. Branch" */
const NUM_RE = /^\s*(\d+[a-z]?(?:\.\d+)*)(?:[.):]\s*|\s+|$)(.*)$/i;

/** "%% 3: Longer explanation" (but not "%%{init: ...}%%") */
const NARRATION_RE = /^\s*%%(?!\{)\s*(\d+[a-z]?(?:\.\d+)*)\s*[:.)-]\s*(.+)$/i;

export interface StepLabel {
  key: string;
  label: string;
  title: string;
}

export function plainText(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim()
    .replace(/^["`]+|["`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whitespace-free, lower-case form used to compare label text. */
export function squash(s: string | null | undefined): string {
  return plainText(s).replace(/\s+/g, '').toLowerCase();
}

/** Reads a step number off the front of an edge label, or null if it has none. */
export function parseStepLabel(text: string): StepLabel | null {
  const plain = plainText(text);
  const m = NUM_RE.exec(plain);
  if (!m || m[1] === undefined) return null;
  return { key: m[1].toLowerCase(), label: m[1], title: (m[2] ?? '').trim() || plain };
}

/**
 * Mermaid reads "1. text" as a Markdown list and renders "Unsupported markdown: list".
 * Swap the dot or paren after a leading number for an entity Mermaid decodes back.
 */
export function escapeNumbered(src: string): string {
  return src
    .split('\n')
    .map((line) =>
      /^\s*%%/.test(line)
        ? line
        : line.replace(
            /(\||"|`|\[|\(|\{|--|==|-\.)([ \t]*)(\d+)([.)])(?=[ \t])/g,
            (_m, open: string, ws: string, n: string, p: string) => open + ws + n + (p === '.' ? '#46;' : '#41;'),
          ),
    )
    .join('\n');
}

type KeyPart = [number, string];

function keyParts(key: string): KeyPart[] {
  return key
    .toLowerCase()
    .split('.')
    .map((part): KeyPart => {
      const m = /^(\d+)([a-z]?)$/.exec(part);
      return m ? [parseInt(m[1] ?? '0', 10), m[2] ?? ''] : [0, part];
    });
}

/** Orders step keys numerically: 1 < 1.2 < 2 < 2a < 2b < 10. */
export function compareKeys(a: string, b: string): number {
  const pa = keyParts(a);
  const pb = keyParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (!x) return -1;
    if (!y) return 1;
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;
  }
  return 0;
}

/** Collects "%% n: text" comments by step key. Repeated keys are joined. */
export function readNarration(src: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of src.split('\n')) {
    const m = NARRATION_RE.exec(line);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const key = m[1].toLowerCase();
    const prev = map.get(key);
    map.set(key, (prev ? prev + ' ' : '') + m[2].trim());
  }
  return map;
}
