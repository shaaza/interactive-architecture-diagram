// Version history for a diagram and its details. Pure: no DOM, no storage, no clock
// (callers pass the time), so it can be tested and reused anywhere.
//
// History is linear and never rewritten. Going back or forward moves `head`, the
// version the working copy is based on. Committing while head is behind the latest
// version appends a new commit at the end, so later versions are never lost.

import { Emitter } from '../lib/emitter';

export interface Snapshot {
  source: string;
  details: string;
}

export interface Commit {
  /** 1, 2, 3...; shown to people as v1, v2, v3. */
  id: number;
  /** The version this one was made from, or null for the first. */
  parent: number | null;
  message: string;
  /** Milliseconds since the epoch. */
  time: number;
  snapshot: Snapshot;
}

export interface RepositoryData {
  commits: Commit[];
  head: number | null;
}

export type HistoryEvents = {
  change: { head: Commit | null; commits: readonly Commit[] };
};

export class HistoryError extends Error {
  override name = 'HistoryError';
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.source === b.source && a.details === b.details;
}

export class Repository extends Emitter<HistoryEvents> {
  private _commits: Commit[];
  private _head: number | null;

  constructor(data: RepositoryData = { commits: [], head: null }) {
    super();
    this._commits = data.commits.map((c) => ({ ...c, snapshot: { ...c.snapshot } }));
    this._head = data.head;
  }

  get commits(): readonly Commit[] {
    return this._commits;
  }

  get head(): Commit | null {
    return this._head === null ? null : (this.find(this._head) ?? null);
  }

  find(id: number): Commit | undefined {
    return this._commits.find((c) => c.id === id);
  }

  /** True when the working copy differs from the version it is based on. */
  isDirty(working: Snapshot): boolean {
    const head = this.head;
    return head ? !sameSnapshot(head.snapshot, working) : this._commits.length === 0 ? false : true;
  }

  /** Saves the working copy as a new version. Throws HistoryError if there is nothing to save. */
  commit(working: Snapshot, message: string, time: number): Commit {
    const text = message.trim();
    if (!text) throw new HistoryError('Write a short message describing the change.');
    const head = this.head;
    if (head && sameSnapshot(head.snapshot, working)) throw new HistoryError('Nothing to commit: no changes since ' + label(head) + '.');
    const last = this._commits[this._commits.length - 1];
    const commit: Commit = {
      id: (last?.id ?? 0) + 1,
      parent: head?.id ?? null,
      message: text,
      time,
      snapshot: { ...working },
    };
    this._commits.push(commit);
    this._head = commit.id;
    this.changed();
    return commit;
  }

  /** Moves head to a version and returns its snapshot for the working copy. */
  checkout(id: number): Snapshot {
    const commit = this.find(id);
    if (!commit) throw new HistoryError(`There is no version v${id}.`);
    this._head = id;
    this.changed();
    return { ...commit.snapshot };
  }

  private headIndex(): number {
    return this._head === null ? -1 : this._commits.findIndex((c) => c.id === this._head);
  }

  canGoBack(): boolean {
    return this.headIndex() > 0;
  }

  canGoForward(): boolean {
    const i = this.headIndex();
    return i >= 0 && i < this._commits.length - 1;
  }

  /** The version before head, without moving to it. */
  previous(): Commit | undefined {
    return this.canGoBack() ? this._commits[this.headIndex() - 1] : undefined;
  }

  /** The version after head, without moving to it. */
  next(): Commit | undefined {
    return this.canGoForward() ? this._commits[this.headIndex() + 1] : undefined;
  }

  toJSON(): RepositoryData {
    return { commits: this._commits, head: this._head };
  }

  private changed(): void {
    this.emit('change', { head: this.head, commits: this._commits });
  }
}

export const label = (c: Commit): string => `v${c.id}`;

/** Validates data read back from storage. Throws HistoryError when it is not a repository. */
export function parseRepository(raw: unknown): RepositoryData {
  if (!raw || typeof raw !== 'object') throw new HistoryError('Saved history is not an object.');
  const { commits, head } = raw as Record<string, unknown>;
  if (!Array.isArray(commits)) throw new HistoryError('Saved history has no commit list.');
  const parsed = commits.map((c, i): Commit => {
    const r = (c ?? {}) as Record<string, unknown>;
    const snap = (r.snapshot ?? {}) as Record<string, unknown>;
    if (
      typeof r.id !== 'number' ||
      (r.parent !== null && typeof r.parent !== 'number') ||
      typeof r.message !== 'string' ||
      typeof r.time !== 'number' ||
      typeof snap.source !== 'string' ||
      typeof snap.details !== 'string'
    ) {
      throw new HistoryError(`Saved commit ${i + 1} is malformed.`);
    }
    return { id: r.id, parent: r.parent as number | null, message: r.message, time: r.time, snapshot: { source: snap.source, details: snap.details } };
  });
  if (head !== null && (typeof head !== 'number' || !parsed.some((c) => c.id === head))) {
    throw new HistoryError('Saved history points at a missing version.');
  }
  return { commits: parsed, head: head as number | null };
}
