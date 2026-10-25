// Switches between the editor and the Admin view. "#admin" in the address opens Admin.

import { byId } from './dom';

export type ViewName = 'editor' | 'admin';

export function createViews(onShow: (view: ViewName) => void): { show(view: ViewName): void } {
  const workspace = byId('workspaceView', HTMLElement);
  const admin = byId('adminView', HTMLElement);
  const tabs = { editor: byId('viewEditor', HTMLButtonElement), admin: byId('viewAdmin', HTMLButtonElement) };

  function show(view: ViewName): void {
    workspace.hidden = view !== 'editor';
    admin.hidden = view !== 'admin';
    document.body.classList.toggle('admin-open', view === 'admin');
    for (const [name, tab] of Object.entries(tabs)) tab.setAttribute('aria-pressed', String(name === view));
    // Keep a share link's hash; only the bare "#admin" token is ours.
    if (view === 'admin' && location.hash !== '#admin') history.replaceState(null, '', '#admin');
    if (view === 'editor' && location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
    onShow(view);
  }

  tabs.editor.addEventListener('click', () => show('editor'));
  tabs.admin.addEventListener('click', () => show('admin'));
  window.addEventListener('hashchange', () => show(location.hash === '#admin' ? 'admin' : 'editor'));
  if (location.hash === '#admin') queueMicrotask(() => show('admin'));
  return { show };
}
