import { byId } from './dom';

const DEBOUNCE_MS = 400;

export interface Editor {
  value: string;
  /** Shows an error under the text box, or clears it when passed null. */
  showError(message: string | null): void;
}

export interface EditorOptions {
  textareaId: string;
  errorId: string;
  /** Called after typing pauses. Not called when `value` is set from code. */
  onChange(text: string): void;
}

/** Wires a text box: debounced change events and Tab to indent. */
export function createEditor({ textareaId, errorId, onChange }: EditorOptions): Editor {
  const textarea = byId(textareaId, HTMLTextAreaElement);
  const errorBox = byId(errorId, HTMLElement);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  textarea.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => onChange(textarea.value), DEBOUNCE_MS);
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = textarea;
    textarea.value = value.slice(0, a) + '  ' + value.slice(b);
    textarea.selectionStart = textarea.selectionEnd = a + 2;
    textarea.dispatchEvent(new Event('input'));
  });

  return {
    get value() {
      return textarea.value;
    },
    set value(text: string) {
      textarea.value = text;
    },
    showError(message) {
      errorBox.hidden = !message;
      errorBox.textContent = message ?? '';
    },
  };
}

export type StatusKind = 'ok' | 'err';

export function createStatus(): (kind: StatusKind, text: string) => void {
  const status = byId('status', HTMLElement);
  return (kind, text) => {
    status.textContent = text;
    status.className = `status ${kind}`;
  };
}

/** The Diagram / Details tabs above the editor. */
export function bindTabs(): { markError(tab: 'diagram' | 'details', on: boolean): void } {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (next) {
        select(next);
        next.focus();
      }
    });
  });
  return {
    markError(name, on) {
      tabs.find((t) => t.dataset.tab === name)?.classList.toggle('has-error', on);
    },
  };
}
