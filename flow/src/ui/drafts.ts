// The user's own work, kept in localStorage between visits. The diagram and its
// details are saved together, and only when the user types, so loading an example
// never leaves a stale copy behind.

export interface Workspace {
  source: string;
  details: string;
}

const KEY = 'mermaid-flow-animator.workspace.v2';
// Earlier versions saved each text separately, including copies of examples.
const LEGACY_SOURCE = 'mermaid-flow-animator.src';
const LEGACY_DETAILS = 'mermaid-flow-animator.details';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; drafts just won't survive a reload.
  }
}

const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * Converts drafts saved by earlier versions. A saved diagram that is just one of
 * the examples is dropped, so the example loads fresh with its current details.
 */
export function migrateLegacy(
  source: string | null,
  details: string | null,
  exampleDiagrams: readonly string[],
): Workspace | null {
  if (source === null || exampleDiagrams.some((d) => same(d, source))) return null;
  return { source, details: details ?? '' };
}

function parse(json: string | null): Workspace | null {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (v && typeof v === 'object') {
      const { source, details } = v as Record<string, unknown>;
      if (typeof source === 'string' && typeof details === 'string') return { source, details };
    }
  } catch {
    // Corrupt draft; ignore it.
  }
  return null;
}

export function loadWorkspace(exampleDiagrams: readonly string[]): Workspace | null {
  const saved = parse(read(KEY));
  if (saved) return saved;
  const legacySource = read(LEGACY_SOURCE);
  if (legacySource === null) return null;
  const migrated = migrateLegacy(legacySource, read(LEGACY_DETAILS), exampleDiagrams);
  write(LEGACY_SOURCE, null);
  write(LEGACY_DETAILS, null);
  if (migrated) saveWorkspace(migrated);
  return migrated;
}

export function saveWorkspace(workspace: Workspace): void {
  write(KEY, JSON.stringify(workspace));
}

export function clearWorkspace(): void {
  write(KEY, null);
}
