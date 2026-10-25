// Composition root: wires the adapter, timeline, effects and UI together.

import { pickAdapter } from './adapters/registry';
import { sameSnapshot, type Snapshot } from './history/repository';
import { autosave, loadRepository } from './history/storage';
import { DetailsError, emptyDetails, parseDetails, type DetailsDoc } from './details/schema';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples';
import { applyStates, dwellFor, playStep } from './play/effects';
import { Timeline } from './play/timeline';
import { DiagramError, type Scene, type StepGroup } from './types';
import { createCanvas, createEditorToggle } from './ui/canvas';
import { createConfirm } from './ui/confirm';
import { bindCaption } from './ui/caption';
import { byId } from './ui/dom';
import { clearWorkspace, loadWorkspace, saveWorkspace } from './ui/drafts';
import { bindTabs, createEditor, createStatus } from './ui/editor';
import { createHistoryPanel } from './ui/history-panel';
import { createInspector } from './ui/inspector';
import { bindShareButton, sharedFromHash } from './ui/share';
import { fontsReady, onThemeChange, readTheme } from './ui/theme';
import { bindTransport } from './ui/transport';

declare const __SHARE_LINKS__: boolean;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = createCanvas();
let scene: Scene | null = null;
let details: DetailsDoc = emptyDetails();
let buildGen = 0;
let lastSrc: string | null = null;

const timeline: Timeline<StepGroup> = new Timeline<StepGroup>({
  player: (step, _index, { animate, signal }): Promise<void> =>
    playStep(step, { animate, signal, speed: timeline.speed, reduceMotion: reduceMotion.matches }),
  dwell: dwellFor,
});
timeline.on('cursor', ({ index }) => {
  if (scene) applyStates(scene, index);
});

const setStatus = createStatus();
const tabs = bindTabs();
const sourceEditor = createEditor({
  textareaId: 'src',
  errorId: 'error',
  onChange: (src) => {
    workingCopyChanged();
    void build(src, { keepCursor: true });
  },
});
const detailsEditor = createEditor({
  textareaId: 'details',
  errorId: 'detailsError',
  onChange: (text) => {
    workingCopyChanged();
    updateDetails(text);
  },
});

const workingCopy = (): Snapshot => ({ source: sourceEditor.value, details: detailsEditor.value });

// Version history. The working copy is the editors' contents; it is kept as a
// draft only while it differs from the version it is based on.
const repo = loadRepository();
const history = createHistoryPanel({
  repo,
  ask: createConfirm(),
  getWorkingCopy: workingCopy,
  // Before the first commit, anything other than an unedited example is unsaved work.
  isDirty: (w) =>
    repo.commits.length
      ? repo.isDirty(w)
      : !Object.values(EXAMPLES).some((e) => sameSnapshot({ source: e.diagram, details: e.details }, w)),
  setWorkingCopy: (snapshot) => {
    loadWorkingCopy(snapshot);
    clearWorkspace();
  },
});
autosave(repo, (message) => history.showMessage(message, 'err'));
repo.on('change', () => saveDraft());

function saveDraft(): void {
  const head = repo.head;
  if (head && sameSnapshot(head.snapshot, workingCopy())) clearWorkspace();
  else saveWorkspace(workingCopy());
}

function workingCopyChanged(): void {
  saveDraft();
  history.refresh();
}

/** Puts a diagram and its details in the editors and redraws. */
function loadWorkingCopy({ source, details: text }: Snapshot): void {
  sourceEditor.value = source;
  detailsEditor.value = text;
  updateDetails(text);
  history.refresh();
  void build(source);
}

// Pause while a popup is open, and carry on afterwards if it was playing.
let resumeAfterPopup = false;
const inspector = createInspector({
  host: canvas.host,
  getDetails: () => details,
  onOpen: () => {
    resumeAfterPopup = timeline.playing;
    timeline.pause();
  },
  onClose: () => {
    if (resumeAfterPopup) timeline.play();
  },
});

bindCaption(timeline);
bindTransport(timeline, { onToggleEditor: createEditorToggle() });
if (__SHARE_LINKS__) bindShareButton(() => ({ source: sourceEditor.value, details: detailsEditor.value }));

function showSourceError(message: string | null): void {
  sourceEditor.showError(message);
  tabs.markError('diagram', !!message);
  if (message) setStatus('err', 'Syntax error, showing last good diagram');
}

/** Keeps the last good details when the text has an error. */
function updateDetails(text: string): void {
  try {
    details = parseDetails(text);
    detailsEditor.showError(null);
    tabs.markError('details', false);
  } catch (err) {
    detailsEditor.showError(err instanceof DetailsError ? err.message : String(err));
    tabs.markError('details', true);
  }
}

async function build(src: string, { keepCursor = false } = {}): Promise<void> {
  const gen = ++buildGen;
  let rendered;
  try {
    rendered = await pickAdapter(src).render(src, readTheme());
  } catch (err) {
    if (gen === buildGen) showSourceError(err instanceof DiagramError ? err.message : String(err));
    return;
  }
  if (gen !== buildGen) return;

  timeline.cancel();
  scene = rendered.mount(canvas.host);
  inspector.attach(scene);
  showSourceError(null);
  lastSrc = src;

  const n = scene.steps.length;
  canvas.setHint(
    scene.notice ?? (n ? null : 'No numbered edges yet. Start an edge label with a number, like A -->|1. Request| B'),
  );
  setStatus('ok', n ? `${n} step${n === 1 ? '' : 's'}` : 'Rendered');
  timeline.load(scene.steps, keepCursor ? timeline.cursor : 0);
}

function bindExamples(): void {
  const select = byId('example', HTMLSelectElement);
  for (const name of Object.keys(EXAMPLES)) select.add(new Option(name, name));
  select.addEventListener('change', async () => {
    const example = EXAMPLES[select.value];
    const name = select.value;
    select.value = '';
    if (!example || !(await history.confirmDiscard(`load the ${name} example`))) return;
    timeline.setPlaying(true);
    loadWorkingCopy({ source: example.diagram, details: example.details });
    // Before the first commit an example is not the user's work, so it isn't saved
    // as a draft; that way it always shows its latest details. After that it is an
    // uncommitted change like any other.
    if (repo.commits.length) saveDraft();
    else clearWorkspace();
  });
}

async function start(): Promise<void> {
  bindExamples();
  onThemeChange(() => {
    if (lastSrc !== null) void build(lastSrc, { keepCursor: true });
  });

  // A share link wins, then unsaved edits, then the current version, then the default example.
  const fallback = EXAMPLES[DEFAULT_EXAMPLE];
  const initial =
    sharedFromHash(location.hash) ??
    loadWorkspace(Object.values(EXAMPLES).map((e) => e.diagram)) ??
    repo.head?.snapshot ??
    (fallback ? { source: fallback.diagram, details: fallback.details } : { source: '', details: '' });
  sourceEditor.value = initial.source;
  detailsEditor.value = initial.details;
  updateDetails(initial.details);
  history.refresh();

  if (!window.mermaid) {
    setStatus('err', 'Could not load Mermaid');
    showSourceError('The Mermaid library did not load. Check your connection and reload the page.');
    return;
  }
  await fontsReady();
  await build(sourceEditor.value);
}

void start();
