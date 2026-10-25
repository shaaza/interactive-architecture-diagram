// Stroke icons for the toolbar and the admin view, drawn on a 24x24 grid.

import type { IconName } from '../blocks/library';

const PATHS: Record<IconName | 'select', string> = {
  select: 'M6 3l12 9-5.2 1.1L15.5 19l-2.3 1-2.7-5.9L6 18z',
  service: 'M4 5h16v14H4z M8 9.5h8 M8 13h5',
  database: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  cache: 'M13.5 2.5 5 13.5h6.5l-1 8 8.5-11h-6.5z',
  queue: 'M4 4.5h16v4H4z M4 10h16v4H4z M4 15.5h16v4H4z',
  worker: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  gateway: 'M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z M9 12l2 2 4-4',
  client: 'M3 4.5h18v11H3z M8 20h8 M12 15.5V20',
  external: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M3 12h18 M12 3c3 3.2 3 14.8 0 18 M12 3c-3 3.2-3 14.8 0 18',
  api: 'M3.5 12h15 M13 6l6 6-6 6',
  box: 'M5 5h14v14H5z',
};

export function icon(name: IconName | 'select'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS.box);
  svg.append(path);
  return svg;
}
