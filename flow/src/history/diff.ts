// Line-level change counts between two versions, for the history list.

import type { Snapshot } from './repository';

export interface LineChanges {
  added: number;
  removed: number;
}

export interface SnapshotChanges {
  diagram: LineChanges;
  details: LineChanges;
}

/** Counts added and removed lines using the longest common subsequence. */
export function lineChanges(before: string, after: string): LineChanges {
  if (before === after) return { added: 0, removed: 0 };
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];

  // Trim the common prefix and suffix so the LCS table only covers the changed middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const row = new Array<number>(midB.length + 1).fill(0);
  for (let i = 1; i <= midA.length; i++) {
    let diag = 0;
    for (let j = 1; j <= midB.length; j++) {
      const up = row[j] ?? 0;
      row[j] = midA[i - 1] === midB[j - 1] ? diag + 1 : Math.max(up, row[j - 1] ?? 0);
      diag = up;
    }
  }
  const common = row[midB.length] ?? 0;
  return { added: midB.length - common, removed: midA.length - common };
}

export function snapshotChanges(before: Snapshot | null, after: Snapshot): SnapshotChanges {
  return {
    diagram: lineChanges(before?.source ?? '', after.source),
    details: lineChanges(before?.details ?? '', after.details),
  };
}
