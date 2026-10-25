import type { Timeline } from '../play/timeline';
import type { StepGroup } from '../types';
import { byId, isTypingTarget } from './dom';

const PAUSE_ICON = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
const PLAY_ICON = 'M8 5v14l11-7z';

export interface TransportOptions {
  onToggleEditor: () => void;
}

/** Play/pause, stepping, step chips, speed, loop and keyboard shortcuts. */
export function bindTransport(timeline: Timeline<StepGroup>, { onToggleEditor }: TransportOptions): void {
  const play = byId('play', HTMLButtonElement);
  const playIcon = document.getElementById('playIcon');
  const chips = byId('chips', HTMLElement);
  const speed = byId('speed', HTMLSelectElement);
  const loop = byId('loop', HTMLInputElement);

  byId('prev', HTMLButtonElement).addEventListener('click', () => timeline.step(-1));
  byId('next', HTMLButtonElement).addEventListener('click', () => timeline.step(1));
  byId('restart', HTMLButtonElement).addEventListener('click', () => timeline.restart());
  play.addEventListener('click', () => timeline.toggle());
  speed.addEventListener('change', () => timeline.setSpeed(parseFloat(speed.value)));
  loop.addEventListener('change', () => timeline.setLoop(loop.checked));
  timeline.setSpeed(parseFloat(speed.value));
  timeline.setLoop(loop.checked);

  const renderPlaying = () => {
    playIcon?.setAttribute('d', timeline.playing ? PAUSE_ICON : PLAY_ICON);
    play.setAttribute('aria-label', timeline.playing ? 'Pause' : 'Play');
  };

  const buildChips = () => {
    chips.replaceChildren(
      ...timeline.steps.map((step, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = step.label;
        b.title = step.edges.map((e) => e.title).join(' · ');
        b.setAttribute('aria-label', `Step ${step.label}: ${b.title}`);
        b.addEventListener('click', () => timeline.goTo(i));
        return b;
      }),
    );
  };

  const markChips = () => {
    [...chips.children].forEach((chip, i) => {
      chip.classList.toggle('done', i < timeline.cursor);
      chip.classList.toggle('active', i === timeline.cursor);
      if (i === timeline.cursor) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
    });
  };

  timeline.on('load', buildChips);
  timeline.on('cursor', markChips);
  timeline.on('playing', renderPlaying);
  renderPlaying();

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        timeline.toggle();
        break;
      case 'ArrowRight':
        e.preventDefault();
        timeline.step(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        timeline.step(-1);
        break;
      case 'Home':
        e.preventDefault();
        timeline.restart();
        break;
      case 'f':
      case 'F':
        onToggleEditor();
        break;
    }
  });
}
