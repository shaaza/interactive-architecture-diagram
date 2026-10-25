// Composition root: wires the adapter, timeline, effects and UI together.

import { pickAdapter } from './adapters/registry';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples';
import { applyStates, dwellFor, playStep } from './play/effects';
import { Timeline } from './play/timeline';
import { DiagramError, type Scene, type StepGroup } from './types';
import { createCanvas, createEditorToggle } from './ui/canvas';
import { bindCaption } from './ui/caption';
import { byId } from './ui/dom';
import { createEditor, loadDraft, saveDraft } from './ui/editor';
import { bindShareButton, srcFromHash } from './ui/share';
import { fontsReady, onThemeChange, readTheme } from './ui/theme';
import { bindTransport } from './ui/transport';

declare const __SHARE_LINKS__: boolean;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = createCanvas();
let scene: Scene | null = null;
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

const editor = createEditor((src) => void build(src, { keepCursor: true }));
bindCaption(timeline);
bindTransport(timeline, { onToggleEditor: createEditorToggle() });
if (__SHARE_LINKS__) bindShareButton(() => editor.value);

async function build(src: string, { keepCursor = false } = {}): Promise<void> {
  const gen = ++buildGen;
  let rendered;
  try {
    rendered = await pickAdapter(src).render(src, readTheme());
  } catch (err) {
    if (gen === buildGen) editor.showError(err instanceof DiagramError ? err.message : String(err));
    return;
  }
  if (gen !== buildGen) return;

  timeline.cancel();
  scene = rendered.mount(canvas.host);
  editor.showError(null);
  lastSrc = src;

  const n = scene.steps.length;
  canvas.setHint(
    scene.notice ?? (n ? null : 'No numbered edges yet. Start an edge label with a number, like A -->|1. Request| B'),
  );
  editor.setStatus('ok', n ? `${n} step${n === 1 ? '' : 's'}` : 'Rendered');
  timeline.load(scene.steps, keepCursor ? timeline.cursor : 0);
}

function bindExamples(): void {
  const select = byId('example', HTMLSelectElement);
  for (const name of Object.keys(EXAMPLES)) select.add(new Option(name, name));
  select.addEventListener('change', () => {
    const src = EXAMPLES[select.value];
    select.value = '';
    if (src === undefined) return;
    editor.value = src;
    saveDraft(src);
    timeline.setPlaying(true);
    void build(src);
  });
}

async function start(): Promise<void> {
  bindExamples();
  onThemeChange(() => {
    if (lastSrc !== null) void build(lastSrc, { keepCursor: true });
  });
  editor.value = srcFromHash(location.hash) ?? loadDraft() ?? EXAMPLES[DEFAULT_EXAMPLE] ?? '';
  if (!window.mermaid) {
    editor.setStatus('err', 'Could not load Mermaid');
    editor.showError('The Mermaid library did not load. Check your connection and reload the page.');
    return;
  }
  await fontsReady();
  await build(editor.value);
}

void start();
