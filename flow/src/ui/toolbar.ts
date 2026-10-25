// The insert toolbar: one tool per block in the library, in the style of a
// paint program's tool box. Box tools open the insert form; the API-call tool
// picks a source box, then a target box, then opens the form. What it inserts
// is locked; the toolbar never edits anything after inserting it.

import { InsertError, insertEdge, insertNode, nextStep, suggestId } from '../blocks/insert';
import type { BlockDef } from '../blocks/library';
import type { Snapshot } from '../history/repository';
import type { NodeRef, Scene } from '../types';
import { byId, h } from './dom';
import { icon } from './icons';

export interface ToolbarOptions {
  host: HTMLElement;
  getLibrary(): readonly BlockDef[];
  getScene(): Scene | null;
  getWorkingCopy(): Snapshot;
  /** IDs already used by boxes, from the diagram and the details. */
  takenIds(): Set<string>;
  /** Puts the edited texts in the editors and redraws. */
  apply(snapshot: Snapshot, message: string): void;
}

export interface Toolbar {
  /** Redraws the tools after the library changes. */
  render(): void;
  /** True while the API-call tool is choosing boxes; clicks then pick instead of opening popups. */
  isPicking(): boolean;
}

type Mode = { tool: 'select' } | { tool: 'pick'; block: BlockDef; from: NodeRef | null };

const MULTILINE = new Set(['headers', 'request', 'response', 'description', 'deploy']);

export function createToolbar(opts: ToolbarOptions): Toolbar {
  const bar = byId('toolbar', HTMLElement);
  const hint = byId('pickHint', HTMLElement);
  const dialog = byId('insertDialog', HTMLDialogElement);
  const form = byId('insertForm', HTMLFormElement);
  const title = byId('insertTitle', HTMLElement);
  const fieldsBox = byId('insertFields', HTMLElement);
  const errorBox = byId('insertError', HTMLElement);
  let mode: Mode = { tool: 'select' };
  let submit: (() => void) | null = null;

  function setMode(next: Mode): void {
    mode = next;
    opts.host.classList.toggle('picking', next.tool === 'pick');
    if (next.tool === 'pick') {
      hint.hidden = false;
      hint.textContent = next.from
        ? `${next.block.label}: now click the box it goes to. Esc to cancel.`
        : `${next.block.label}: click the box the call starts from. Esc to cancel.`;
    } else {
      hint.hidden = true;
    }
    opts.host.querySelectorAll('.fa-pick-from').forEach((n) => n.classList.remove('fa-pick-from'));
    if (next.tool === 'pick' && next.from) next.from.el.classList.add('fa-pick-from');
    for (const b of bar.querySelectorAll<HTMLButtonElement>('button[data-tool]')) {
      const on = next.tool === 'select' ? b.dataset.tool === 'select' : b.dataset.tool === next.block.type;
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function toolButton(id: string, label: string, ico: SVGSVGElement, onClick: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'tool', 'data-tool': id, title: label, 'aria-label': label, 'aria-pressed': 'false' }) as HTMLButtonElement;
    b.append(ico);
    b.addEventListener('click', onClick);
    return b;
  }

  function render(): void {
    const tools = [
      toolButton('select', 'Select: click boxes and arrows for details', icon('select'), () => setMode({ tool: 'select' })),
      ...opts.getLibrary().map((block) =>
        toolButton(block.type, block.kind === 'edge' ? `${block.label}: pick two boxes` : `Insert ${block.label}`, icon(block.icon), () => {
          if (block.kind === 'edge') setMode({ tool: 'pick', block, from: null });
          else {
            setMode({ tool: 'select' });
            openNodeForm(block);
          }
        }),
      ),
    ];
    bar.replaceChildren(...tools);
    setMode({ tool: 'select' });
  }

  // ---------- Form ----------

  function input(id: string, labelText: string, value: string, multiline = false, extra: Record<string, string> = {}): { row: HTMLElement; el: HTMLInputElement | HTMLTextAreaElement } {
    const el = (multiline ? h('textarea', { id, rows: '2', spellcheck: 'false', ...extra }) : h('input', { id, type: 'text', autocomplete: 'off', ...extra })) as HTMLInputElement | HTMLTextAreaElement;
    el.value = value;
    return { row: h('label', { class: 'form-row', for: id }, h('span', {}, labelText), el), el };
  }

  function blockFields(block: BlockDef): { rows: HTMLElement[]; read(): Record<string, string> } {
    const els = block.fields.map((f) => {
      const multi = MULTILINE.has(f.key) || (f.default ?? '').trim().startsWith('{');
      return { key: f.key, ...input(`insert-field-${f.key}`, f.label, f.default ?? '', multi) };
    });
    return { rows: els.map((e) => e.row), read: () => Object.fromEntries(els.map((e) => [e.key, e.el.value])) };
  }

  function open(heading: string, rows: HTMLElement[], onSubmit: () => void): void {
    title.textContent = heading;
    fieldsBox.replaceChildren(...rows);
    errorBox.hidden = true;
    submit = onSubmit;
    dialog.showModal();
    fieldsBox.querySelector<HTMLElement>('input, textarea')?.focus();
  }

  function tryApply(make: () => Snapshot, message: string): void {
    try {
      opts.apply(make(), message);
      dialog.close();
    } catch (err) {
      if (!(err instanceof InsertError)) throw err;
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  }

  function openNodeForm(block: BlockDef): void {
    const taken = opts.takenIds();
    const label = input('insert-label', 'Label', block.label);
    const id = input('insert-id', 'ID in the diagram', suggestId(block.label, taken), false, { pattern: '[A-Za-z][A-Za-z0-9_]*' });
    // The ID follows the label until someone edits it.
    let idEdited = false;
    id.el.addEventListener('input', () => (idEdited = true));
    label.el.addEventListener('input', () => {
      if (!idEdited) id.el.value = suggestId(label.el.value, taken);
    });
    const fields = blockFields(block);
    open(`New ${block.label}`, [label.row, id.row, ...fields.rows], () =>
      tryApply(
        () => insertNode(opts.getWorkingCopy(), { block, id: id.el.value, label: label.el.value, values: fields.read() }, opts.takenIds()),
        `Inserted ${block.label} ${id.el.value.trim()}`,
      ),
    );
  }

  function openEdgeForm(block: BlockDef, from: NodeRef, to: NodeRef): void {
    const working = opts.getWorkingCopy();
    const step = input('insert-step', 'Step number (leave empty for an arrow outside the flow)', nextStep(working.source));
    const label = input('insert-label', 'Label', '');
    const fields = blockFields(block);
    open(`New ${block.label}: ${from.name} → ${to.name}`, [step.row, label.row, ...fields.rows], () =>
      tryApply(
        () => insertEdge(opts.getWorkingCopy(), { block, from: from.id, to: to.id, step: step.el.value || null, label: label.el.value, values: fields.read() }),
        `Inserted ${block.label} ${from.id} → ${to.id}`,
      ),
    );
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit?.();
  });
  byId('insertCancel', HTMLButtonElement).addEventListener('click', () => dialog.close());

  // ---------- Picking boxes for an arrow ----------

  // Capture phase, so a pick click never also reaches the details popup.
  opts.host.addEventListener(
    'click',
    (e) => {
      if (mode.tool !== 'pick' || !(e.target instanceof Element)) return;
      e.stopPropagation();
      const g = e.target.closest('g.node');
      const node = g ? opts.getScene()?.nodes.find((n) => n.el === g) : undefined;
      if (node) pick(node);
    },
    { capture: true },
  );

  function pick(node: NodeRef): void {
    if (mode.tool !== 'pick') return;
    if (!mode.from) {
      setMode({ ...mode, from: node });
    } else if (node !== mode.from) {
      const { block, from } = mode;
      setMode({ tool: 'select' });
      openEdgeForm(block, from, node);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode.tool === 'pick') setMode({ tool: 'select' });
  });

  render();
  return { render, isPicking: () => mode.tool === 'pick' };
}
