// Keeps the repository in browser storage. The store is injectable for tests.

import { parseRepository, Repository, type RepositoryData } from './repository';

const KEY = 'mermaid-flow-animator.history.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Loads saved history, or an empty repository if there is none or it is unreadable. */
export function loadRepository(store: Store | null = defaultStore()): Repository {
  try {
    const json = store?.getItem(KEY);
    if (json) return new Repository(parseRepository(JSON.parse(json)));
  } catch {
    // Unreadable or corrupt history; start fresh rather than fail to load the page.
  }
  return new Repository();
}

/** Saves history. Returns false when storage is unavailable or full. */
export function saveRepository(data: RepositoryData, store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Saves after every change to the repository. Calls onError when a save fails. */
export function autosave(repo: Repository, onError: (message: string) => void, store: Store | null = defaultStore()): void {
  repo.on('change', () => {
    if (!saveRepository(repo.toJSON(), store)) {
      onError('History could not be saved in this browser. Storage may be full or turned off.');
    }
  });
}
