// The version bar (back, forward, commit) and the History tab's list of versions.
// Talks to the history module only through Repository; the editors are reached
// through the get/set callbacks.

import { snapshotChanges, type LineChanges } from '../history/diff';
import { HistoryError, label, type Commit, type Repository, type Snapshot } from '../history/repository';
import type { Ask } from './confirm';
import { byId, h } from './dom';

export interface HistoryPanelOptions {
  repo: Repository;
  ask: Ask;
  getWorkingCopy(): Snapshot;
  /** Replaces the editors' contents and redraws the diagram. */
  setWorkingCopy(snapshot: Snapshot): void;
  /** Whether the working copy has changes that would be lost. Defaults to differing from the current version. */
  isDirty?: (working: Snapshot) => boolean;
  now?: () => number;
}

export interface HistoryPanel {
  /** Updates the bar and list after the working copy changes. */
  refresh(): void;
  /** Resolves true when it is fine to replace the working copy. Asks first if there are uncommitted changes. */
  confirmDiscard(action: string): Promise<boolean>;
  showMessage(text: string, kind?: 'ok' | 'err'): void;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(then: number, now: number): string {
  const s = Math.round((then - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

function changeText(name: string, c: LineChanges): string | null {
  if (!c.added && !c.removed) return null;
  return `${name} ${c.added ? `+${c.added}` : ''}${c.added && c.removed ? ' ' : ''}${c.removed ? `−${c.removed}` : ''}`;
}

export function createHistoryPanel({
  repo,
  ask,
  getWorkingCopy,
  setWorkingCopy,
  isDirty = (w) => repo.isDirty(w),
  now = Date.now,
}: HistoryPanelOptions): HistoryPanel {
  const back = byId('histBack', HTMLButtonElement);
  const forward = byId('histForward', HTMLButtonElement);
  const headLabel = byId('histHead', HTMLElement);
  const dirtyPill = byId('histDirty', HTMLElement);
  const form = byId('commitForm', HTMLFormElement);
  const input = byId('commitMessage', HTMLInputElement);
  const message = byId('histMessage', HTMLElement);
  const list = byId('historyList', HTMLElement);
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  const panel: HistoryPanel = {
    refresh() {
      const head = repo.head;
      const dirty = isDirty(getWorkingCopy());
      headLabel.textContent = head ? `${label(head)} · ${head.message}` : 'No versions yet';
      headLabel.title = head ? `${label(head)} of ${repo.commits.length}: ${head.message}` : '';
      dirtyPill.hidden = !dirty;
      const previous = repo.previous();
      const next = repo.next();
      back.disabled = !previous;
      forward.disabled = !next;
      back.title = previous ? `Roll back to ${label(previous)}: ${previous.message}` : 'No earlier version';
      forward.title = next ? `Go forward to ${label(next)}: ${next.message}` : 'No later version';
      renderList(head, dirty);
    },

    async confirmDiscard(action) {
      if (!isDirty(getWorkingCopy())) return true;
      return ask(`You have uncommitted changes. Discard them and ${action}?`, 'Discard changes');
    },

    showMessage(text, kind = 'ok') {
      clearTimeout(messageTimer);
      message.textContent = text;
      message.className = `hist-msg ${kind}`;
      if (kind === 'ok') messageTimer = setTimeout(() => (message.textContent = ''), 4000);
    },
  };

  function renderList(head: Commit | null, dirty: boolean): void {
    const t = now();
    if (!repo.commits.length) {
      list.replaceChildren(
        h('li', { class: 'history-empty' }, 'No versions yet. Write a message above and press Commit to save the current diagram and details as v1.'),
      );
      return;
    }
    list.replaceChildren(
      ...[...repo.commits].reverse().map((c) => {
        const isHead = c.id === head?.id;
        const parent = c.parent === null ? null : (repo.find(c.parent)?.snapshot ?? null);
        const changes = snapshotChanges(parent, c.snapshot);
        const summary = [changeText('Diagram', changes.diagram), changeText('Details', changes.details)].filter(Boolean).join(' · ');
        const open = h('button', { type: 'button', class: 'btn small' }, `Open ${label(c)}`);
        open.addEventListener('click', () => void goTo(c));
        return h(
          'li',
          { class: `commit${isHead ? ' is-head' : ''}` },
          h(
            'div',
            { class: 'commit-top' },
            h('span', { class: 'commit-id' }, label(c)),
            h('span', { class: 'commit-msg' }, c.message),
            isHead ? h('span', { class: 'head-tag' }, dirty ? 'Current, edited' : 'Current') : null,
          ),
          h(
            'div',
            { class: 'commit-meta' },
            h('time', { datetime: new Date(c.time).toISOString(), title: new Date(c.time).toLocaleString() }, relativeTime(c.time, t)),
            c.parent !== null && c.parent !== c.id - 1 ? ` · from ${label(repo.find(c.parent) ?? c)}` : '',
            summary ? ` · ${summary}` : '',
          ),
          isHead ? null : open,
        );
      }),
    );
  }

  async function goTo(commit: Commit | undefined): Promise<void> {
    if (!commit || commit.id === repo.head?.id) return;
    if (!(await panel.confirmDiscard(`open ${label(commit)}`))) return;
    setWorkingCopy(repo.checkout(commit.id));
    panel.showMessage(`Opened ${label(commit)}: ${commit.message}`);
  }

  back.addEventListener('click', () => void goTo(repo.previous()));
  forward.addEventListener('click', () => void goTo(repo.next()));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const commit = repo.commit(getWorkingCopy(), input.value, now());
      input.value = '';
      panel.showMessage(`Committed ${label(commit)}`);
    } catch (err) {
      if (!(err instanceof HistoryError)) throw err;
      panel.showMessage(err.message, 'err');
      input.focus();
    }
  });

  repo.on('change', () => panel.refresh());
  panel.refresh();
  return panel;
}
