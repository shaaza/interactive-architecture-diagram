import { describe, expect, it } from 'vitest';
import { compareKeys, escapeNumbered, parseStepLabel, plainText, readNarration } from '../src/parse/steps';

describe('parseStepLabel', () => {
  it.each([
    ['1. Request', { key: '1', label: '1', title: 'Request' }],
    ['2) Reply', { key: '2', label: '2', title: 'Reply' }],
    ['3: Query', { key: '3', label: '3', title: 'Query' }],
    ['1.2 Sub-step', { key: '1.2', label: '1.2', title: 'Sub-step' }],
    ['2A. Branch', { key: '2a', label: '2A', title: 'Branch' }],
    ['"4. quoted"', { key: '4', label: '4', title: 'quoted' }],
    ['5. line<br>break', { key: '5', label: '5', title: 'line break' }],
  ])('reads %j', (text, expected) => {
    expect(parseStepLabel(text)).toEqual(expected);
  });

  it('uses the full text as the title when only a number is given', () => {
    expect(parseStepLabel('7')).toEqual({ key: '7', label: '7', title: '7' });
  });

  it.each(['Request', 'v1.2 rollout', '', 'HTTP 200'])('ignores unnumbered label %j', (text) => {
    expect(parseStepLabel(text)).toBeNull();
  });
});

describe('compareKeys', () => {
  it('sorts numerically, then by sub-step and letter', () => {
    const keys = ['10', '2b', '1.2', '2', '1', '2a', '1.10'];
    expect([...keys].sort(compareKeys)).toEqual(['1', '1.2', '1.10', '2', '2a', '2b', '10']);
  });
});

describe('escapeNumbered', () => {
  it('escapes a leading number in every edge label form', () => {
    const src = [
      'A -->|1. pipe| B',
      'A -- 2. dash --> B',
      'A -->|"3) quoted"| B',
      'A == 4. thick ==> B',
      'A -. 5. dotted .-> B',
    ].join('\n');
    expect(escapeNumbered(src).split('\n')).toEqual([
      'A -->|1#46; pipe| B',
      'A -- 2#46; dash --> B',
      'A -->|"3#41; quoted"| B',
      'A == 4#46; thick ==> B',
      'A -. 5#46; dotted .-> B',
    ]);
  });

  it('leaves comments and numbers that are not list markers alone', () => {
    const src = '%% 1. narration\nA -->|v1.2 rollout| B\nA -->|1.5x faster| B';
    expect(escapeNumbered(src)).toBe(src);
  });
});

describe('readNarration', () => {
  it('collects step comments and skips directives', () => {
    const src = '%%{init: {"theme": "dark"}}%%\n%% 1: First\n%% 2a. Second\n%% 1: more\n%% plain comment';
    expect(Object.fromEntries(readNarration(src))).toEqual({ '1': 'First more', '2a': 'Second' });
  });
});

describe('plainText', () => {
  it('strips tags, quotes and extra whitespace', () => {
    expect(plainText('  "<b>Hello</b><br/>world"  ')).toBe('Hello world');
  });
});
