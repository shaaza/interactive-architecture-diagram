import { byId } from './dom';

const STORE_KEY = 'mermaid-flow-animator.src';
const DEBOUNCE_MS = 400;

export type StatusKind = 'ok' | 'err';

export interface Editor {
  value: string;
  setStatus(kind: StatusKind, text: string): void;
  /** Shows a syntax error, or clears it when passed null. */
  showError(message: string | null): void;
}

export function loadDraft(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function saveDraft(src: string): void {
  try {
    localStorage.setItem(STORE_KEY, src);
  } catch {
    // Storage unavailable; the draft just won't survive a reload.
  }
}

/** Wires the source textarea: debounced change events, Tab to indent, draft saving. */
export function createEditor(onChange: (src: string) => void): Editor {
  const textarea = byId('src', HTMLTextAreaElement);
  const status = byId('status', HTMLElement);
  const errorBox = byId('error', HTMLElement);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  textarea.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      saveDraft(textarea.value);
      onChange(textarea.value);
    }, DEBOUNCE_MS);
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = textarea;
    textarea.value = value.slice(0, a) + '  ' + value.slice(b);
    textarea.selectionStart = textarea.selectionEnd = a + 2;
    textarea.dispatchEvent(new Event('input'));
  });

  const editor: Editor = {
    get value() {
      return textarea.value;
    },
    set value(src: string) {
      textarea.value = src;
    },
    setStatus(kind, text) {
      status.textContent = text;
      status.className = `status ${kind}`;
    },
    showError(message) {
      errorBox.hidden = !message;
      errorBox.textContent = message ?? '';
      if (message) editor.setStatus('err', 'Syntax error, showing last good diagram');
    },
  };
  return editor;
}
