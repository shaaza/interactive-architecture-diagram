// Assistant settings, kept in this browser. The API key never leaves the
// browser except in requests to the Anthropic API.

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recommended)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (most capable)' },
] as const;

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface AiSettings {
  apiKey: string;
  model: string;
  effort: Effort;
}

export const DEFAULT_SETTINGS: AiSettings = { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' };

const KEY = 'mermaid-flow-animator.assistant.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: Store | null = defaultStore()): AiSettings {
  try {
    const raw: unknown = JSON.parse(store?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      return {
        apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
        model: typeof r.model === 'string' && r.model ? r.model : DEFAULT_SETTINGS.model,
        effort: (EFFORTS as readonly unknown[]).includes(r.effort) ? (r.effort as Effort) : DEFAULT_SETTINGS.effort,
      };
    }
  } catch {
    // Unreadable settings; use the defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AiSettings, store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** "sk-ant-api03-abcd...wxyz" for showing which key is saved without showing it. */
export function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : key ? '…' : '';
}
