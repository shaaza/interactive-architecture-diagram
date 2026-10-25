import type { Timeline } from '../play/timeline';
import type { StepGroup } from '../types';
import { byId } from './dom';

/** Keeps the caption (step number, title, narration) in sync with the timeline. */
export function bindCaption(timeline: Timeline<StepGroup>): void {
  const no = byId('stepNo', HTMLElement);
  const meta = byId('stepMeta', HTMLElement);
  const title = byId('stepTitle', HTMLElement);
  const desc = byId('stepDesc', HTMLElement);

  const render = () => {
    const n = timeline.steps.length;
    const step = timeline.steps[timeline.cursor];
    no.classList.toggle('idle', !step);
    if (!step) {
      no.textContent = n ? '0' : '–';
      meta.textContent = n ? `${n} steps` : '';
      title.textContent = n ? 'Ready' : 'Nothing to animate yet';
      desc.textContent = n ? 'Press play or → to begin.' : 'Number your edge labels to create a flow.';
      return;
    }
    no.textContent = step.label;
    meta.textContent =
      `Step ${timeline.cursor + 1} of ${n}` + (step.edges.length > 1 ? ` · ${step.edges.length} in parallel` : '');
    title.textContent = step.edges.map((e) => e.title).join('  ·  ');
    desc.textContent = step.narration;
  };

  timeline.on('cursor', render);
  timeline.on('load', render);
  render();
}
