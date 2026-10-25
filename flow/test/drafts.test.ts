import { describe, expect, it } from 'vitest';
import { migrateLegacy } from '../src/ui/drafts';

const examples = ['flowchart LR\n  A -->|1. x| B', 'flowchart TB\n  C --> D'];

describe('migrateLegacy', () => {
  it('drops a saved copy of an example so it loads fresh', () => {
    expect(migrateLegacy(examples[0] ?? '', null, examples)).toBeNull();
    expect(migrateLegacy(`\n${examples[1]}  \n`, 'nodes: {}', examples)).toBeNull();
  });

  it('keeps the user’s own diagram and details', () => {
    expect(migrateLegacy('flowchart LR\n  Mine --> Yours', 'nodes:\n  Mine: {}', examples)).toEqual({
      source: 'flowchart LR\n  Mine --> Yours',
      details: 'nodes:\n  Mine: {}',
    });
  });

  it('gives an own diagram saved before the Details tab empty details', () => {
    expect(migrateLegacy('flowchart LR\n  Mine --> Yours', null, examples)?.details).toBe('');
  });

  it('returns null when nothing was saved', () => {
    expect(migrateLegacy(null, 'nodes: {}', examples)).toBeNull();
  });
});
