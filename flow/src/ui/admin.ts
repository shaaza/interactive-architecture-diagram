// The Admin view: assistant settings (API key, model, effort) and the block
// library editor. Changes are saved in this browser.

import { blockProblems, ICONS, LibraryError, SHAPES, type BlockDef, type BlockField, type IconName, type Shape } from '../blocks/library';
import { EFFORTS, maskKey, MODELS, type AiSettings, type Effort } from '../ai/settings';
import type { Ask } from './confirm';
import { byId, h } from './dom';
import { icon } from './icons';

export interface AdminOptions {
  getLibrary(): readonly BlockDef[];
  /** Validates, saves and applies a library. Throws LibraryError. */
  setLibrary(blocks: BlockDef[]): void;
  resetLibrary(): void;
  getSettings(): AiSettings;
  setSettings(settings: AiSettings): boolean;
  /** Checks the key and model; resolves with a message or rejects with one. */
  testConnection(): Promise<string>;
  /** Resolves true when the assistant runs on the viewer's Claude account, so no key is needed. */
  usesClaudeAccount(): Promise<boolean>;
  ask: Ask;
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '')
    .slice(0, 40) || 'block';

export function createAdmin(opts: AdminOptions): { render(): void } {
  // ---------- Assistant settings ----------
  const key = byId('aiKey', HTMLInputElement);
  const model = byId('aiModel', HTMLSelectElement);
  const effort = byId('aiEffort', HTMLSelectElement);
  const aiStatus = byId('aiStatus', HTMLElement);
  const keyState = byId('aiKeyState', HTMLElement);
  for (const m of MODELS) model.add(new Option(m.label, m.id));
  for (const e of EFFORTS) effort.add(new Option(e === 'medium' ? 'medium (recommended)' : e, e));

  function status(el: HTMLElement, text: string, kind: 'ok' | 'err' | '' = ''): void {
    el.textContent = text;
    el.className = `admin-status ${kind}`;
  }

  function renderSettings(): void {
    const s = opts.getSettings();
    key.value = '';
    key.type = 'password';
    keyState.textContent = s.apiKey ? `Saved key: ${maskKey(s.apiKey)}` : 'No key saved.';
    if (![...model.options].some((o) => o.value === s.model)) model.add(new Option(s.model, s.model));
    model.value = s.model;
    effort.value = s.effort;
  }

  byId('aiKeyShow', HTMLButtonElement).addEventListener('click', (e) => {
    key.type = key.type === 'password' ? 'text' : 'password';
    (e.currentTarget as HTMLButtonElement).textContent = key.type === 'password' ? 'Show' : 'Hide';
  });

  byId('aiForm', HTMLFormElement).addEventListener('submit', (e) => {
    e.preventDefault();
    const current = opts.getSettings();
    const typed = key.value.trim();
    if (typed && !typed.startsWith('sk-ant-')) {
      status(aiStatus, 'That does not look like an Anthropic API key. Keys start with sk-ant-.', 'err');
      return;
    }
    const next = { apiKey: typed || current.apiKey, model: model.value, effort: effort.value as Effort };
    if (!opts.setSettings(next)) return status(aiStatus, 'Could not save: this browser is not keeping local data.', 'err');
    renderSettings();
    status(aiStatus, 'Saved.', 'ok');
  });

  byId('aiTest', HTMLButtonElement).addEventListener('click', async () => {
    status(aiStatus, 'Testing…');
    try {
      status(aiStatus, await opts.testConnection(), 'ok');
    } catch (err) {
      status(aiStatus, err instanceof Error ? err.message : String(err), 'err');
    }
  });

  byId('aiForget', HTMLButtonElement).addEventListener('click', async () => {
    if (!opts.getSettings().apiKey) return status(aiStatus, 'No key is saved.');
    if (!(await opts.ask('Remove the saved API key from this browser?', 'Remove key'))) return;
    opts.setSettings({ ...opts.getSettings(), apiKey: '' });
    renderSettings();
    status(aiStatus, 'Key removed.', 'ok');
  });

  void opts.usesClaudeAccount().then((yes) => {
    byId('aiAccountNote', HTMLElement).hidden = !yes;
    byId('aiKeyFields', HTMLElement).hidden = yes;
  });

  // ---------- Blocks ----------
  const list = byId('blockList', HTMLElement);
  const editor = byId('blockEditor', HTMLElement);
  const blockStatus = byId('blockStatus', HTMLElement);

  function describe(b: BlockDef): string {
    const shape = b.kind === 'node' && b.shape ? SHAPES[b.shape].label : '';
    return [b.kind === 'edge' ? 'Arrow' : `Box${shape ? `, ${shape.toLowerCase()}` : ''}`, `${b.fields.length} field${b.fields.length === 1 ? '' : 's'}`].join(' · ');
  }

  function renderList(): void {
    list.replaceChildren(
      ...opts.getLibrary().map((b, i) => {
        const edit = h('button', { type: 'button', class: 'btn small' }, 'Edit');
        edit.addEventListener('click', () => openEditor(i));
        const del = h('button', { type: 'button', class: 'btn small' }, 'Delete');
        del.addEventListener('click', async () => {
          if (!(await opts.ask(`Delete the ${b.label} block? Objects already in diagrams keep their details.`, 'Delete block'))) return;
          save(opts.getLibrary().filter((_, j) => j !== i), `Deleted ${b.label}.`);
        });
        const swatch = h('span', { class: 'block-icon' });
        swatch.append(icon(b.icon));
        if (b.color) swatch.style.color = b.color;
        return h(
          'li',
          { class: 'block-item' },
          swatch,
          h('div', { class: 'block-text' }, h('strong', {}, b.label), h('span', { class: 'block-meta' }, h('code', {}, b.type), ` · ${describe(b)}`)),
          h('div', { class: 'block-actions' }, edit, del),
        );
      }),
    );
  }

  function save(blocks: BlockDef[], message: string): boolean {
    try {
      opts.setLibrary(blocks);
    } catch (err) {
      if (!(err instanceof LibraryError)) throw err;
      status(blockStatus, err.message, 'err');
      return false;
    }
    renderList();
    status(blockStatus, message, 'ok');
    return true;
  }

  function row(label: string, control: HTMLElement): HTMLElement {
    return h('label', { class: 'form-row' }, h('span', {}, label), control);
  }

  function fieldRow(field: BlockField): HTMLElement {
    const keyIn = h('input', { type: 'text', class: 'f-key', 'aria-label': 'Field key', placeholder: 'key', autocomplete: 'off' }) as HTMLInputElement;
    const labelIn = h('input', { type: 'text', class: 'f-label', 'aria-label': 'Field label', placeholder: 'Label', autocomplete: 'off' }) as HTMLInputElement;
    const defIn = h('input', { type: 'text', class: 'f-default', 'aria-label': 'Default value', placeholder: 'Default (optional)', autocomplete: 'off' }) as HTMLInputElement;
    keyIn.value = field.key;
    labelIn.value = field.label;
    defIn.value = field.default ?? '';
    const remove = h('button', { type: 'button', class: 'btn icon small', 'aria-label': 'Remove field', title: 'Remove field' }, '×');
    const li = h('li', { class: 'field-row' }, keyIn, labelIn, defIn, remove);
    remove.addEventListener('click', () => li.remove());
    return li;
  }

  /** Opens the editor for block `index`, or for a new block when index is -1. */
  function openEditor(index: number): void {
    const existing = opts.getLibrary()[index];
    const block: BlockDef = existing ? structuredClone(existing) : { type: '', label: '', kind: 'node', shape: 'rect', icon: 'box', fields: [] };

    const label = h('input', { type: 'text', id: 'blockLabel', autocomplete: 'off' }) as HTMLInputElement;
    label.value = block.label;
    const type = h('input', { type: 'text', id: 'blockType', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    type.value = block.type;
    let typeEdited = !!existing;
    type.addEventListener('input', () => (typeEdited = true));
    label.addEventListener('input', () => {
      if (!typeEdited) type.value = slug(label.value);
    });

    const kind = h('select', { id: 'blockKind' }) as HTMLSelectElement;
    kind.add(new Option('Box', 'node'));
    kind.add(new Option('Arrow (API call)', 'edge'));
    kind.value = block.kind;
    const shape = h('select', { id: 'blockShape' }) as HTMLSelectElement;
    for (const [k, v] of Object.entries(SHAPES)) shape.add(new Option(v.label, k));
    shape.value = block.shape ?? 'rect';
    const shapeRow = row('Shape in the diagram', shape);
    const syncKind = () => (shapeRow.hidden = kind.value !== 'node');
    kind.addEventListener('change', syncKind);
    syncKind();

    const icons = h('div', { class: 'icon-picker', role: 'radiogroup', 'aria-label': 'Icon' });
    for (const name of ICONS) {
      const id = `blockIcon-${name}`;
      const radio = h('input', { type: 'radio', name: 'blockIcon', id, value: name }) as HTMLInputElement;
      radio.checked = name === block.icon;
      const lab = h('label', { for: id, title: name, class: 'icon-choice' });
      lab.append(icon(name));
      icons.append(radio, lab);
    }

    const color = h('input', { type: 'color', id: 'blockColor' }) as HTMLInputElement;
    color.value = /^#[0-9a-f]{6}$/i.test(block.color ?? '') ? (block.color as string) : '#3d5a99';
    const noColor = h('input', { type: 'checkbox', id: 'blockNoColor' }) as HTMLInputElement;
    noColor.checked = !block.color;
    const colorRow = h('div', { class: 'form-row' }, h('span', {}, 'Badge colour'), h('div', { class: 'inline' }, color, h('label', { for: 'blockNoColor', class: 'inline' }, noColor, 'Use the default colour')));

    const fields = h('ol', { class: 'field-list' }, ...block.fields.map(fieldRow));
    const addField = h('button', { type: 'button', class: 'btn small' }, 'Add field');
    addField.addEventListener('click', () => {
      const r = fieldRow({ key: '', label: '' });
      fields.append(r);
      r.querySelector('input')?.focus();
    });

    const problems = h('p', { class: 'admin-status err', role: 'alert' });
    const saveBtn = h('button', { type: 'submit', class: 'btn primary-text' }, existing ? 'Save block' : 'Add block');
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Cancel');
    cancel.addEventListener('click', closeEditor);

    const form = h(
      'form',
      { class: 'block-form', novalidate: '' },
      h('h4', {}, existing ? `Edit ${existing.label}` : 'New block'),
      h('div', { class: 'form-grid' }, row('Label', label), row('Type name (written in the details)', type), row('Kind', kind), shapeRow),
      h('div', { class: 'form-row' }, h('span', {}, 'Icon'), icons),
      colorRow,
      h('div', { class: 'form-row' }, h('span', {}, 'Parameters, in the order the popup shows them'), h('div', { class: 'field-head', 'aria-hidden': 'true' }, h('span', {}, 'Key'), h('span', {}, 'Label'), h('span', {}, 'Default')), fields, addField),
      problems,
      h('div', { class: 'insert-actions' }, cancel, saveBtn),
    );

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const next: BlockDef = {
        type: type.value.trim(),
        label: label.value.trim(),
        kind: kind.value === 'edge' ? 'edge' : 'node',
        ...(kind.value === 'node' ? { shape: shape.value as Shape } : {}),
        icon: ((form.querySelector('input[name="blockIcon"]:checked') as HTMLInputElement | null)?.value ?? 'box') as IconName,
        ...(noColor.checked ? {} : { color: color.value }),
        fields: [...fields.querySelectorAll('.field-row')]
          .map((r) => {
            const get = (c: string) => (r.querySelector(c) as HTMLInputElement).value.trim();
            const def = get('.f-default');
            return { key: get('.f-key'), label: get('.f-label') || get('.f-key'), ...(def ? { default: def } : {}) };
          })
          .filter((f) => f.key || f.label),
      };
      const own = blockProblems(next);
      if (own.length) {
        problems.textContent = own.join(' ');
        return;
      }
      const lib = [...opts.getLibrary()];
      if (existing) lib[index] = next;
      else lib.push(next);
      if (save(lib, existing ? `Saved ${next.label}.` : `Added ${next.label}. It is now in the tool box.`)) closeEditor();
      else problems.textContent = blockStatus.textContent;
    });

    editor.replaceChildren(form);
    editor.hidden = false;
    label.focus();
  }

  function closeEditor(): void {
    editor.hidden = true;
    editor.replaceChildren();
  }

  byId('blockAdd', HTMLButtonElement).addEventListener('click', () => openEditor(-1));
  byId('blockReset', HTMLButtonElement).addEventListener('click', async () => {
    if (!(await opts.ask('Replace your blocks with the built-in set? Blocks you added or changed are lost.', 'Reset blocks'))) return;
    opts.resetLibrary();
    closeEditor();
    renderList();
    status(blockStatus, 'Blocks reset to the built-in set.', 'ok');
  });

  return {
    render() {
      renderSettings();
      renderList();
      status(aiStatus, '');
    },
  };
}
