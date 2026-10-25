// An inline yes/no prompt. The page cannot rely on window.confirm(), which some hosts block.

import { byId } from './dom';

export type Ask = (question: string, confirmLabel: string) => Promise<boolean>;

/** Binds the prompt whose elements are #<prefix>Bar, #<prefix>Text, #<prefix>Yes and #<prefix>No. */
export function createConfirm(prefix = 'confirm'): Ask {
  const bar = byId(`${prefix}Bar`, HTMLElement);
  const text = byId(`${prefix}Text`, HTMLElement);
  const yes = byId(`${prefix}Yes`, HTMLButtonElement);
  const no = byId(`${prefix}No`, HTMLButtonElement);
  let pending: ((answer: boolean) => void) | null = null;

  const settle = (answer: boolean) => {
    bar.hidden = true;
    const resolve = pending;
    pending = null;
    resolve?.(answer);
  };
  yes.addEventListener('click', () => settle(true));
  no.addEventListener('click', () => settle(false));
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') settle(false);
  });

  return (question, confirmLabel) => {
    settle(false); // A newer question cancels an unanswered one.
    text.textContent = question;
    yes.textContent = confirmLabel;
    bar.hidden = false;
    no.focus();
    return new Promise((resolve) => {
      pending = resolve;
    });
  };
}
