// Keeps the block library in browser storage. The store is injectable for tests.

import { defaultLibrary, parseLibrary, type BlockDef } from './library';

const KEY = 'mermaid-flow-animator.blocks.v1';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved library, or the built-in blocks when none is saved or it is unreadable. */
export function loadLibrary(store: Store | null = defaultStore()): BlockDef[] {
  try {
    const json = store?.getItem(KEY);
    if (json) return parseLibrary(JSON.parse(json));
  } catch {
    // Fall back to the built-in blocks rather than fail to load.
  }
  return defaultLibrary();
}

/** Saves the library. Returns false when storage is unavailable or full. */
export function saveLibrary(blocks: readonly BlockDef[], store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(KEY, JSON.stringify(blocks));
    return true;
  } catch {
    return false;
  }
}

export function resetLibrary(store: Store | null = defaultStore()): BlockDef[] {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing saved to remove.
  }
  return defaultLibrary();
}
