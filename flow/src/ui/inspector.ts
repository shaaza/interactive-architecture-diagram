// Makes boxes and arrows clickable and shows their details in a read-only dialog.

import { findEdgeDetails, resolveType, type DetailsDoc } from '../details/schema';
import type { LinkRef, NodeRef, Scene } from '../types';
import { linkView, namesFor, nodeView, type View, type ViewCallbacks } from './details-view';
import { byId } from './dom';

const SVGNS = 'http://www.w3.org/2000/svg';

export interface InspectorOptions {
  host: HTMLElement;
  getDetails(): DetailsDoc;
  /** Called when the dialog opens from closed, and when it closes. */
  onOpen(): void;
  onClose(): void;
}

export interface Inspector {
  /** Binds click targets for a newly mounted scene. */
  attach(scene: Scene): void;
  openNode(id: string): void;
  openLink(link: LinkRef): void;
  close(): void;
}

export function createInspector({ host, getDetails, onOpen, onClose }: InspectorOptions): Inspector {
  const dialog = byId('inspector', HTMLDialogElement);
  const kicker = byId('inspectorKicker', HTMLElement);
  const title = byId('inspectorTitle', HTMLElement);
  const subtitle = byId('inspectorSubtitle', HTMLElement);
  const body = byId('inspectorBody', HTMLElement);

  let scene: Scene | null = null;
  let targets = new WeakMap<Element, LinkRef | NodeRef>();

  const callbacks: ViewCallbacks = {
    openNode: (id) => inspector.openNode(id),
    openLink: (link) => inspector.openLink(link),
  };

  function show(view: View): void {
    kicker.replaceChildren(view.kicker);
    title.textContent = view.title;
    subtitle.replaceChildren(...(view.subtitle ? [view.subtitle] : []));
    body.replaceChildren(view.body);
    body.scrollTop = 0;
    if (!dialog.open) {
      onOpen();
      dialog.showModal();
    }
  }

  // A wide, invisible stroke over each arrow so it is easy to click.
  function addHitArea(link: LinkRef): SVGPathElement {
    const hit = document.createElementNS(SVGNS, 'path');
    hit.setAttribute('d', link.path.getAttribute('d') ?? '');
    hit.setAttribute('class', 'fa-hit');
    const name = link.step ? `Step ${link.step}: ${link.title}` : link.title || `${link.fromId} to ${link.toId}`;
    hit.setAttribute('aria-label', name);
    link.path.after(hit);
    return hit;
  }

  function isHidden(link: LinkRef): boolean {
    return link.path.classList.contains('fa-hidden');
  }

  host.addEventListener('click', (e) => {
    if (!scene || !(e.target instanceof Element)) return;
    const el = e.target.closest('.fa-hit, g.edgeLabel, g.node');
    const target = el ? targets.get(el) : undefined;
    if (!target) return;
    if ('path' in target) {
      if (!isHidden(target)) inspector.openLink(target);
    } else {
      inspector.openNode(target.id);
    }
  });

  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.target instanceof Element)) return;
    const target = targets.get(e.target);
    if (target && !('path' in target)) {
      e.preventDefault();
      inspector.openNode(target.id);
    }
  });

  dialog.addEventListener('close', onClose);
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  byId('inspectorClose', HTMLButtonElement).addEventListener('click', () => dialog.close());

  const inspector: Inspector = {
    attach(next) {
      scene = next;
      targets = new WeakMap();
      if (dialog.open) dialog.close();
      for (const node of next.nodes) {
        targets.set(node.el, node);
        node.el.classList.add('fa-clickable');
        node.el.setAttribute('tabindex', '0');
        node.el.setAttribute('role', 'button');
        node.el.setAttribute('aria-label', `${node.name}: show details`);
      }
      for (const link of next.links) {
        targets.set(addHitArea(link), link);
        if (link.label) {
          targets.set(link.label, link);
          link.label.classList.add('fa-clickable');
        }
      }
    },

    openNode(id) {
      if (!scene) return;
      const node = scene.nodes.find((n) => n.id === id);
      if (!node) return;
      const doc = getDetails();
      const details = doc.nodes.get(id) ?? null;
      show(nodeView(node, details, resolveType(doc, details?.type), scene.links, namesFor(scene.nodes, doc), callbacks));
    },

    openLink(link) {
      if (!scene) return;
      const doc = getDetails();
      show(linkView(link, findEdgeDetails(doc, link), namesFor(scene.nodes, doc), callbacks));
    },

    close() {
      if (dialog.open) dialog.close();
    },
  };
  return inspector;
}
