import { describe, expect, it, vi } from 'vitest';
import { instructions, readChange, runTool, ToolError, userTurn, type AgentContext } from '../src/ai/agent';
import { DEFAULT_SETTINGS, loadSettings, maskKey, saveSettings } from '../src/ai/settings';
import { defaultLibrary } from '../src/blocks/library';

function context(problems: string[] = []): AgentContext & { applied: unknown[] } {
  const applied: unknown[] = [];
  return {
    applied,
    instructions: () => 'rules',
    workspace: () => ({ source: 'flowchart LR', details: '' }),
    check: vi.fn(async () => problems),
    apply: (next, summary) => applied.push({ next, summary }),
  };
}

describe('instructions', () => {
  it('lists the configured node types and arrow kinds', () => {
    const lib = defaultLibrary();
    lib.push({ type: 'lambda', label: 'Lambda', kind: 'node', shape: 'round', icon: 'worker', fields: [{ key: 'runtime', label: 'Runtime' }] });
    const text = instructions(lib);
    expect(text).toContain('- lambda (Lambda): runtime');
    expect(text).toContain('- cache (Cache): engine, ttl, eviction');
    expect(text).toContain('- API call: method, endpoint, protocol');
    expect(text).toMatch(/locked: true.*must not change/s);
  });
});

describe('userTurn', () => {
  it('wraps the current texts and the request', () => {
    expect(userTurn('Add a cache', { source: 'flowchart LR', details: 'nodes: {}' })).toBe(
      'Current diagram:\n<diagram>\nflowchart LR\n</diagram>\n\nCurrent details:\n<details>\nnodes: {}\n</details>\n\nRequest: Add a cache',
    );
  });
});

describe('readChange', () => {
  it('accepts a complete change', () => {
    expect(readChange({ diagram: 'flowchart LR', details: '', summary: ' Did it ' })).toEqual({ diagram: 'flowchart LR', details: '', summary: 'Did it' });
  });

  it.each([[null], [{ diagram: 'x' }], [{ diagram: 1, details: '', summary: '' }]])('rejects partial or mistyped input %j', (input) => {
    expect(() => readChange(input)).toThrow(ToolError);
  });

  it('rejects an empty diagram', () => {
    expect(() => readChange({ diagram: '  ', details: '', summary: 's' })).toThrow(/empty/);
  });
});

describe('runTool', () => {
  const input = { diagram: 'flowchart LR\n  A --> B', details: 'nodes: {}', summary: 'Linked A to B.' };

  it('applies a change that passes the checks', async () => {
    const ctx = context();
    const onApplied = vi.fn();
    await expect(runTool(input, ctx, { onText: () => {}, onApplied })).resolves.toBe('Applied.');
    expect(ctx.applied).toEqual([{ next: { source: input.diagram, details: input.details }, summary: 'Linked A to B.' }]);
    expect(onApplied).toHaveBeenCalledWith('Linked A to B.');
  });

  it('sends the problems back without applying', async () => {
    const ctx = context(['Box Q is locked and was changed.']);
    await expect(runTool(input, ctx, { onText: () => {}, onApplied: () => {} })).rejects.toThrow(/Not applied[\s\S]*Box Q is locked/);
    expect(ctx.applied).toEqual([]);
  });
});

describe('settings', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('defaults to Claude Opus 5.5 at medium effort with no key', () => {
    expect(loadSettings(memory())).toEqual({ apiKey: '', model: 'claude-opus-5-5', effort: 'medium' });
  });

  it('saves and loads, ignoring unknown effort values', () => {
    const store = memory();
    saveSettings({ apiKey: 'sk-ant-x', model: 'claude-sonnet-5-5', effort: 'high' }, store);
    expect(loadSettings(store)).toEqual({ apiKey: 'sk-ant-x', model: 'claude-sonnet-5-5', effort: 'high' });
    store.setItem('mermaid-flow-animator.assistant.v1', '{"effort": "turbo"}');
    expect(loadSettings(store).effort).toBe(DEFAULT_SETTINGS.effort);
  });

  it('masks keys', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-…mnop');
    expect(maskKey('')).toBe('');
  });
});
