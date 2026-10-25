import { describe, expect, it } from 'vitest';
import { appendEntry, InsertError, insertEdge, insertNode, nextStep, parseFieldValue, suggestId } from '../src/blocks/insert';
import { blockProblems, DEFAULT_BLOCKS, defaultLibrary, parseLibrary, validateLibrary, type BlockDef } from '../src/blocks/library';
import { lockViolations } from '../src/blocks/locks';
import { loadLibrary, saveLibrary } from '../src/blocks/storage';
import { parseDetails } from '../src/details/schema';
import { parseStepLabel } from '../src/parse/steps';

const block = (type: string) => DEFAULT_BLOCKS.find((b) => b.type === type)!;
const base = { source: 'flowchart LR\n  A[App] -->|1. Call| B[DB]\n', details: '# my notes\nnodes:\n  A: { type: service }\n\nedges:\n  "1": { method: GET }\n' };

describe('library', () => {
  it('ships valid built-in blocks', () => {
    expect(() => validateLibrary(DEFAULT_BLOCKS)).not.toThrow();
    expect(DEFAULT_BLOCKS.map((b) => b.type)).toEqual(['api', 'service', 'database', 'cache', 'queue', 'worker', 'gateway', 'client', 'external']);
  });

  it('reports bad definitions', () => {
    const bad: BlockDef = { type: 'Bad Type', label: '', kind: 'node', icon: 'box', fields: [{ key: 'deploy', label: 'x' }, { key: 'a', label: 'A' }, { key: 'a', label: 'A' }] };
    const problems = blockProblems(bad);
    expect(problems.join('\n')).toMatch(/type name/);
    expect(problems.join('\n')).toMatch(/give it a label/);
    expect(problems.join('\n')).toMatch(/choose a shape/);
    expect(problems.join('\n')).toMatch(/"deploy" is reserved/);
    expect(problems.join('\n')).toMatch(/"a" appears twice/);
  });

  it('rejects duplicate type names', () => {
    const lib = defaultLibrary();
    lib.push({ ...lib[1]!, label: 'Copy' });
    expect(() => validateLibrary(lib)).toThrow(/Two blocks use the type name "service"/);
  });

  it('round-trips through storage and falls back to the defaults', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    const lib = defaultLibrary();
    lib.push({ type: 'lambda', label: 'Lambda', kind: 'node', shape: 'round', icon: 'worker', fields: [{ key: 'runtime', label: 'Runtime', default: 'nodejs20.x' }] });
    expect(saveLibrary(lib, store)).toBe(true);
    expect(loadLibrary(store).at(-1)?.fields[0]?.default).toBe('nodejs20.x');
    data.set('mermaid-flow-animator.blocks.v1', '[{"type": "BAD"}]');
    expect(loadLibrary(store)).toHaveLength(DEFAULT_BLOCKS.length);
    expect(() => parseLibrary({})).toThrow(/not a list/);
  });
});

describe('helpers', () => {
  it('suggests unused ids', () => {
    expect(suggestId('Order service', new Set())).toBe('OrderService');
    expect(suggestId('Order service', new Set(['OrderService', 'OrderService2']))).toBe('OrderService3');
    expect(suggestId('3rd-party API!', new Set())).toBe('RdPartyAPI');
    expect(suggestId('end', new Set())).toBe('End');
    expect(suggestId('', new Set())).toBe('Node');
  });

  it('finds the next step number', () => {
    expect(nextStep('A -->|1. x| B\nB -- "7. y" --> C\nC -->|3) z| D')).toBe('8');
    expect(nextStep('A --> B')).toBe('1');
  });

  it('reads field values', () => {
    expect(parseFieldValue('  ')).toBeUndefined();
    expect(parseFieldValue('Auth: Session token')).toBe('Auth: Session token');
    expect(parseFieldValue('{ status: 200 }')).toEqual({ status: 200 });
    expect(parseFieldValue('a: 1\nb: 2')).toEqual({ a: 1, b: 2 });
    expect(() => parseFieldValue('{ broken')).toThrow(InsertError);
  });
});

describe('appendEntry', () => {
  it('appends to an existing section and keeps comments and layout', () => {
    const out = appendEntry(base.details, 'nodes', 'Cache', { type: 'cache', locked: true });
    expect(out).toBe('# my notes\nnodes:\n  A: { type: service }\n  Cache:\n    type: cache\n    locked: true\n\nedges:\n  "1": { method: GET }\n');
  });

  it('creates a missing section, and fills an empty inline one', () => {
    expect(appendEntry('nodes: {}\n', 'edges', 'A->B', { method: 'GET' })).toBe('nodes: {}\n\nedges:\n  A->B:\n    method: GET\n');
    expect(appendEntry('nodes: {}\n', 'nodes', 'A', { type: 'cache' })).toBe('nodes:\n  A:\n    type: cache\n');
    expect(appendEntry('', 'nodes', 'A', { type: 'cache' })).toBe('nodes:\n  A:\n    type: cache\n');
  });

  it('re-serialises JSON documents as JSON', () => {
    expect(JSON.parse(appendEntry('{"nodes": {"A": {}}}', 'nodes', 'B', { type: 'queue' }))).toEqual({ nodes: { A: {}, B: { type: 'queue' } } });
  });

  it('refuses to edit details that do not parse', () => {
    expect(() => appendEntry('nodes: [', 'nodes', 'A', {})).toThrow(/Fix the errors/);
  });
});

describe('insertNode and insertEdge', () => {
  it('adds a locked box to both texts', () => {
    const out = insertNode(base, { block: block('cache'), id: 'Sessions', label: 'Session "hot" cache', values: { engine: 'Redis 7', ttl: '' } }, new Set(['A', 'B']));
    expect(out.source.endsWith('  Sessions[("Session #quot;hot#quot; cache")]\n')).toBe(true);
    const doc = parseDetails(out.details);
    expect(doc.nodes.get('Sessions')).toMatchObject({ type: 'cache', locked: true, params: { engine: 'Redis 7' } });
    expect(doc.nodes.get('A')?.type).toBe('service');
  });

  it('validates the id', () => {
    const ins = (id: string) => () => insertNode(base, { block: block('service'), id, label: '', values: {} }, new Set(['A']));
    expect(ins('A')).toThrow(/already exists/);
    expect(ins('9lives')).toThrow(/must start with a letter/);
    expect(ins('end')).toThrow(/Mermaid keyword/);
  });

  it('adds a locked, numbered API call', () => {
    const out = insertEdge(base, { block: block('api'), from: 'A', to: 'B', step: '2', label: 'Read rows', values: { method: 'POST', endpoint: '/rows', headers: '{ X-Trace: abc }' } });
    expect(out.source.endsWith('  A -->|"2. Read rows"| B\n')).toBe(true);
    const edge = parseDetails(out.details).edges.get('A->B');
    expect(edge).toMatchObject({ method: 'POST', endpoint: '/rows', headers: { 'X-Trace': 'abc' }, locked: true });
    expect(parseStepLabel('"2. Read rows"')).toMatchObject({ key: '2', title: 'Read rows' });
  });

  it('adds an arrow outside the flow without a number', () => {
    expect(insertEdge(base, { block: block('api'), from: 'B', to: 'A', step: null, label: '', values: {} }).source.endsWith('  B --> A\n')).toBe(true);
  });

  it('refuses a second locked arrow between the same boxes', () => {
    const once = insertEdge(base, { block: block('api'), from: 'A', to: 'B', step: '2', label: 'x', values: {} });
    expect(() => insertEdge(once, { block: block('api'), from: 'A', to: 'B', step: '3', label: 'y', values: {} })).toThrow(/already has details/);
  });

  it('rejects mismatched blocks and bad steps', () => {
    expect(() => insertNode(base, { block: block('api'), id: 'X', label: '', values: {} }, new Set())).toThrow(/not a box/);
    expect(() => insertEdge(base, { block: block('api'), from: 'A', to: 'A', step: '2', label: '', values: {} })).toThrow(/two different boxes/);
    expect(() => insertEdge(base, { block: block('api'), from: 'A', to: 'B', step: 'two', label: '', values: {} })).toThrow(/must be a number/);
  });
});

describe('lockViolations', () => {
  const locked = insertEdge(
    insertNode(base, { block: block('queue'), id: 'Q', label: 'Events', values: { broker: 'SQS' } }, new Set(['A', 'B'])),
    { block: block('api'), from: 'A', to: 'Q', step: '2', label: 'Publish', values: { method: 'POST' } },
  );

  it('allows changes that leave locked objects alone', () => {
    const after = { source: locked.source + '  Q --> B\n', details: locked.details.replace('A: { type: service }', 'A: { type: worker }') };
    expect(lockViolations(locked, after)).toEqual([]);
  });

  it('reports a changed box, a changed arrow and a removed box', () => {
    expect(lockViolations(locked, { ...locked, details: locked.details.replace('broker: SQS', 'broker: Kafka') })).toEqual(['Box Q is locked and was changed.']);
    expect(lockViolations(locked, { ...locked, source: locked.source.replace('"2. Publish"', '"2. Send"') })).toEqual(['Arrow A → Q is locked and was changed.']);
    expect(lockViolations(locked, { ...locked, source: locked.source.replace('Q[["Events"]]', 'Q[["Renamed"]]') })).toEqual(['Box Q is locked and was changed.']);
    const removed = locked.details.replace(/  Q:\n(    .*\n)+/, '');
    expect(lockViolations(locked, { ...locked, details: removed })).toEqual(['Box Q is locked and was removed or unlocked.']);
  });

  it('cannot check details that do not parse', () => {
    expect(lockViolations(locked, { ...locked, details: 'nodes: [' })).toEqual(['The details have errors, so locked objects cannot be checked.']);
  });

  it('has nothing to check when nothing is locked', () => {
    expect(lockViolations(base, { source: '', details: '' })).toEqual([]);
  });
});
