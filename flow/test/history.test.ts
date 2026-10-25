import { describe, expect, it } from 'vitest';
import { lineChanges, snapshotChanges } from '../src/history/diff';
import { HistoryError, parseRepository, Repository, type Snapshot } from '../src/history/repository';
import { loadRepository, saveRepository } from '../src/history/storage';

const s = (source: string, details = ''): Snapshot => ({ source, details });

function repoWith(...versions: string[]): Repository {
  const repo = new Repository();
  versions.forEach((v, i) => repo.commit(s(v), `change ${i + 1}`, 1000 + i));
  return repo;
}

describe('Repository', () => {
  it('commits versions with increasing ids, each based on the last', () => {
    const repo = repoWith('a', 'b', 'c');
    expect(repo.commits.map((c) => [c.id, c.parent, c.message])).toEqual([
      [1, null, 'change 1'],
      [2, 1, 'change 2'],
      [3, 2, 'change 3'],
    ]);
    expect(repo.head?.id).toBe(3);
  });

  it('trims the message and requires one', () => {
    const repo = new Repository();
    expect(() => repo.commit(s('a'), '   ', 0)).toThrow(HistoryError);
    expect(repo.commit(s('a'), '  First  ', 0).message).toBe('First');
  });

  it('refuses to commit when nothing changed', () => {
    const repo = repoWith('a');
    expect(() => repo.commit(s('a'), 'again', 0)).toThrow(/Nothing to commit/);
  });

  it('treats a change to either text as a change', () => {
    const repo = repoWith('a');
    expect(repo.isDirty(s('a'))).toBe(false);
    expect(repo.isDirty(s('a', 'nodes: {}'))).toBe(true);
    expect(repo.isDirty(s('b'))).toBe(true);
  });

  it('rolls back and forward without changing the history', () => {
    const repo = repoWith('a', 'b', 'c');
    expect(repo.canGoForward()).toBe(false);
    expect(repo.checkout(repo.previous()!.id)).toEqual(s('b'));
    expect(repo.checkout(repo.previous()!.id)).toEqual(s('a'));
    expect(repo.canGoBack()).toBe(false);
    expect(repo.checkout(repo.next()!.id)).toEqual(s('b'));
    expect(repo.head?.id).toBe(2);
    expect(repo.commits).toHaveLength(3);
  });

  it('appends a commit made from an older version instead of dropping later ones', () => {
    const repo = repoWith('a', 'b', 'c');
    repo.checkout(1);
    const commit = repo.commit(s('a2'), 'redo from v1', 5000);
    expect([commit.id, commit.parent]).toEqual([4, 1]);
    expect(repo.commits.map((c) => c.snapshot.source)).toEqual(['a', 'b', 'c', 'a2']);
    expect(repo.canGoForward()).toBe(false);
    expect(repo.previous()?.id).toBe(3);
  });

  it('returns copies, so editing a snapshot cannot change history', () => {
    const repo = repoWith('a');
    const snap = repo.checkout(1);
    snap.source = 'changed';
    expect(repo.head?.snapshot.source).toBe('a');
  });

  it('emits a change event on commit and checkout', () => {
    const repo = repoWith('a', 'b');
    const heads: (number | undefined)[] = [];
    repo.on('change', ({ head }) => heads.push(head?.id));
    repo.checkout(1);
    repo.commit(s('c'), 'c', 0);
    expect(heads).toEqual([1, 3]);
  });

  it('rejects an unknown version', () => {
    expect(() => repoWith('a').checkout(9)).toThrow(/no version v9/);
  });
});

describe('parseRepository', () => {
  it('round-trips through JSON', () => {
    const repo = repoWith('a', 'b');
    repo.checkout(1);
    const copy = new Repository(parseRepository(JSON.parse(JSON.stringify(repo.toJSON()))));
    expect(copy.toJSON()).toEqual(repo.toJSON());
    expect(copy.head?.id).toBe(1);
  });

  it.each([
    [null, /not an object/],
    [{ commits: 'x', head: null }, /no commit list/],
    [{ commits: [{ id: 1 }], head: 1 }, /commit 1 is malformed/],
    [{ commits: [], head: 3 }, /missing version/],
  ])('rejects %j', (raw, message) => {
    expect(() => parseRepository(raw)).toThrow(message);
  });
});

describe('storage', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('saves and loads', () => {
    const store = memory();
    expect(saveRepository(repoWith('a', 'b').toJSON(), store)).toBe(true);
    expect(loadRepository(store).commits).toHaveLength(2);
  });

  it('starts empty when saved history is corrupt', () => {
    const store = memory();
    store.setItem('mermaid-flow-animator.history.v1', '{"commits": [{"id": "x"}]}');
    expect(loadRepository(store).commits).toHaveLength(0);
  });

  it('reports a failed save', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(saveRepository(repoWith('a').toJSON(), full)).toBe(false);
    expect(saveRepository(repoWith('a').toJSON(), null)).toBe(false);
  });
});

describe('lineChanges', () => {
  it.each([
    ['a\nb\nc', 'a\nb\nc', 0, 0],
    ['a\nb\nc', 'a\nB\nc', 1, 1],
    ['a\nc', 'a\nb\nc', 1, 0],
    ['a\nb\nc', 'c', 0, 2],
    ['', 'x\ny', 2, 0],
    ['x\ny', '', 0, 2],
    ['a\nb\nc\nd', 'b\nX\nd\ne', 2, 2],
  ])('%j -> %j adds %i and removes %i', (before, after, added, removed) => {
    expect(lineChanges(before, after)).toEqual({ added, removed });
  });

  it('compares both texts of a snapshot, from nothing for the first version', () => {
    expect(snapshotChanges(null, s('a\nb', 'x'))).toEqual({
      diagram: { added: 2, removed: 0 },
      details: { added: 1, removed: 0 },
    });
  });
});
