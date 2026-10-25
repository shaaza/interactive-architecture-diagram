import { byId } from './dom';

export interface Canvas {
  host: HTMLElement;
  /** Shows a message over the diagram, or removes it when passed null. */
  setHint(text: string | null): void;
}

export function createCanvas(): Canvas {
  const host = byId('canvas', HTMLElement);
  return {
    host,
    setHint(text) {
      let hint = host.querySelector<HTMLElement>('.hint');
      if (!text) {
        hint?.remove();
        return;
      }
      if (!hint) {
        hint = document.createElement('div');
        hint.className = 'hint';
        host.appendChild(hint);
      }
      hint.textContent = text;
    },
  };
}

/** Hides or shows the editor pane. */
export function createEditorToggle(): () => void {
  const button = byId('focusBtn', HTMLButtonElement);
  const toggle = () => {
    const on = !document.body.classList.contains('focus');
    document.body.classList.toggle('focus', on);
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Show editor' : 'Hide editor';
  };
  button.addEventListener('click', toggle);
  return toggle;
}
