import type { Theme } from '../types';

const FONT = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Reads the current palette from the page's CSS tokens. */
export function readTheme(): Theme {
  return {
    bg: cssVar('--bg'),
    panel: cssVar('--panel'),
    ink: cssVar('--ink'),
    muted: cssVar('--muted'),
    rule: cssVar('--rule'),
    node: cssVar('--node'),
    nodeBorder: cssVar('--node-border'),
    cluster: cssVar('--cluster'),
    fontFamily: FONT,
  };
}

/** Calls back when the OS colour scheme or the host's data-theme changes. */
export function onThemeChange(callback: () => void): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback);
  new MutationObserver(callback).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

/** Waits for the diagram font so Mermaid measures labels correctly, up to a limit. */
export async function fontsReady(timeoutMs = 1500): Promise<void> {
  try {
    await Promise.race([
      Promise.all(['400 14px "IBM Plex Sans"', '600 14px "IBM Plex Sans"'].map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Render with fallback fonts.
  }
}
