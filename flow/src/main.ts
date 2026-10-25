// Composition root: wires the adapter, timeline, effects and UI together.

import { pickAdapter } from './adapters/registry';
import { DetailsError, emptyDetails, parseDetails, type DetailsDoc } from './details/schema';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples';
import { applyStates, dwellFor, playStep } from './play/effects';
import { Timeline } from './play/timeline';
import { DiagramError, type Scene, type StepGroup } from './types';
import { createCanvas, createEditorToggle } from './ui/canvas';
import { bindCaption } from './ui/caption';
import { byId } from './ui/dom';
import { bindTabs, createEditor, createStatus, loadDraft } from './ui/editor';
import { createInspector } from './ui/inspector';
import { bindShareButton, sharedFromHash } from './ui/share';
import { fontsReady, onThemeChange, readTheme } from './ui/theme';
import { bindTransport } from './ui/transport';

declare const __SHARE_LINKS__: boolean;

const SOURCE_KEY = 'mermaid-flow-animator.src';
const DETAILS_KEY = 'mermaid-flow-animator.details';

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
  storeKey: SOURCE_KEY,
  onChange: (src) => void build(src, { keepCursor: true }),
});
const detailsEditor = createEditor({
  textareaId: 'details',
  errorId: 'detailsError',
  storeKey: DETAILS_KEY,
  onChange: (text) => updateDetails(text),
});

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
  select.addEventListener('change', () => {
    const example = EXAMPLES[select.value];
    select.value = '';
    if (!example) return;
    sourceEditor.value = example.diagram;
    detailsEditor.value = example.details;
    sourceEditor.save();
    detailsEditor.save();
    updateDetails(example.details);
    timeline.setPlaying(true);
    void build(example.diagram);
  });
}

async function start(): Promise<void> {
  bindExamples();
  onThemeChange(() => {
    if (lastSrc !== null) void build(lastSrc, { keepCursor: true });
  });

  const shared = sharedFromHash(location.hash);
  const fallback = EXAMPLES[DEFAULT_EXAMPLE];
  const savedSource = loadDraft(SOURCE_KEY);
  sourceEditor.value = shared?.source ?? savedSource ?? fallback?.diagram ?? '';
  // Details go with their diagram: a saved diagram keeps its saved details, even if empty.
  detailsEditor.value = shared
    ? shared.details
    : savedSource !== null
      ? (loadDraft(DETAILS_KEY) ?? '')
      : (fallback?.details ?? '');
  updateDetails(detailsEditor.value);

  if (!window.mermaid) {
    setStatus('err', 'Could not load Mermaid');
    showSourceError('The Mermaid library did not load. Check your connection and reload the page.');
    return;
  }
  await fontsReady();
  await build(sourceEditor.value);
}

void start();
