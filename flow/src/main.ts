// Composition root: wires the adapter, timeline, effects and UI together.

import { pickAdapter } from './adapters/registry';
import { instructions, type AgentContext, type AgentProvider } from './ai/agent';
import { AnthropicProvider, describeApiError } from './ai/anthropic';
import { ArtifactProvider, findSample } from './ai/artifact';
import { loadSettings, saveSettings, type AiSettings } from './ai/settings';
import { LibraryError, typesFromBlocks, validateLibrary, type BlockDef } from './blocks/library';
import { lockViolations } from './blocks/locks';
import { loadLibrary, resetLibrary, saveLibrary } from './blocks/storage';
import { sameSnapshot, type Snapshot } from './history/repository';
import { autosave, loadRepository } from './history/storage';
import { DetailsError, emptyDetails, parseDetails, type DetailsDoc } from './details/schema';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples';
import { applyStates, dwellFor, playStep } from './play/effects';
import { Timeline } from './play/timeline';
import { DiagramError, type Scene, type StepGroup } from './types';
import { createCanvas, createEditorToggle } from './ui/canvas';
import { createAdmin } from './ui/admin';
import { createChat } from './ui/chat';
import { createConfirm } from './ui/confirm';
import { bindCaption } from './ui/caption';
import { byId } from './ui/dom';
import { clearWorkspace, loadWorkspace, saveWorkspace } from './ui/drafts';
import { bindTabs, createEditor, createStatus } from './ui/editor';
import { createHistoryPanel } from './ui/history-panel';
import { createInspector } from './ui/inspector';
import { createToolbar } from './ui/toolbar';
import { createViews } from './ui/views';
import { bindShareButton, sharedFromHash } from './ui/share';
import { fontsReady, onThemeChange, readTheme } from './ui/theme';
import { bindTransport } from './ui/transport';

declare const __SHARE_LINKS__: boolean;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = createCanvas();
let scene: Scene | null = null;
let library: BlockDef[] = loadLibrary();
let details: DetailsDoc = emptyDetails(typesFromBlocks(library));
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
  // Locked objects in the current version may not change.
  commitProblems: (w) => (repo.head ? lockViolations(repo.head.snapshot, w) : []),
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
/** Applies an edit made by the toolbar or the assistant, as an uncommitted change. */
function applyEdit({ source, details: text }: Snapshot, message: string): void {
  sourceEditor.value = source;
  detailsEditor.value = text;
  saveDraft();
  updateDetails(text);
  history.refresh();
  history.showMessage(`${message}. Commit to keep it as a version.`);
  void build(source, { keepCursor: true });
}

const toolbar = createToolbar({
  host: canvas.host,
  getLibrary: () => library,
  getScene: () => scene,
  getWorkingCopy: workingCopy,
  takenIds: () => new Set([...(scene?.nodes.map((n) => n.id) ?? []), ...details.nodes.keys()]),
  apply: applyEdit,
});

const inspector = createInspector({
  host: canvas.host,
  getDetails: () => details,
  isBusy: () => toolbar.isPicking(),
  onOpen: () => {
    resumeAfterPopup = timeline.playing;
    timeline.pause();
  },
  onClose: () => {
    if (resumeAfterPopup) timeline.play();
  },
});

// ---------- Assistant ----------

let settings: AiSettings = loadSettings();
let provider: AgentProvider | null = null;
// Inside a Claude viewer the assistant uses the viewer's Claude account; elsewhere, the saved API key.
const sample = findSample();

async function getProvider(): Promise<{ provider: AgentProvider } | { provider: null; reason: string }> {
  if (provider) return { provider };
  const s = await sample;
  if (s) provider = new ArtifactProvider(s, settings);
  else if (settings.apiKey) provider = new AnthropicProvider(settings);
  else return { provider: null, reason: 'Add your Claude API key in Admin to use the assistant.' };
  return { provider };
}

const agentContext: AgentContext = {
  instructions: () => instructions(library),
  workspace: workingCopy,
  async check(next) {
    const problems: string[] = [];
    const diagramError = await pickAdapter(next.source).validate(next.source);
    if (diagramError) problems.push(`The diagram does not parse: ${diagramError}`);
    try {
      parseDetails(next.details, typesFromBlocks(library));
    } catch (err) {
      problems.push(`The details do not parse: ${err instanceof Error ? err.message : String(err)}`);
    }
    problems.push(...lockViolations(workingCopy(), next));
    return problems;
  },
  apply: (next, summary) => applyEdit(next, `Assistant: ${summary.replace(/\.$/, '')}`),
};

const chat = createChat({ context: agentContext, getProvider, openAdmin: () => views.show('admin') });

// ---------- Admin ----------

const admin = createAdmin({
  getLibrary: () => library,
  setLibrary(blocks) {
    validateLibrary(blocks);
    if (!saveLibrary(blocks)) throw new LibraryError('Could not save: this browser is not keeping local data.');
    useLibrary(blocks);
  },
  resetLibrary: () => useLibrary(resetLibrary()),
  getSettings: () => settings,
  setSettings(next) {
    if (!saveSettings(next)) return false;
    settings = next;
    provider = null;
    chat.reset();
    return true;
  },
  async testConnection() {
    if (await sample) return 'Inside Claude the assistant uses your Claude account. No key is needed here.';
    if (!settings.apiKey) throw new Error('Save an API key first.');
    try {
      return await new AnthropicProvider(settings).test();
    } catch (err) {
      throw new Error(describeApiError(err));
    }
  },
  usesClaudeAccount: async () => !!(await sample),
  ask: createConfirm('adminConfirm'),
});

const views = createViews((view) => {
  if (view === 'admin') admin.render();
});

/** Switches to a new block library: tools, popups and the assistant all follow it. */
function useLibrary(blocks: BlockDef[]): void {
  library = blocks;
  toolbar.render();
  updateDetails(detailsEditor.value);
}

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
    details = parseDetails(text, typesFromBlocks(library));
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
