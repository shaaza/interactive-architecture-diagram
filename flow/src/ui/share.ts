import { byId } from './dom';

export interface Shared {
  source: string;
  details: string;
}

/** UTF-8 safe, URL-safe base64 without padding. */
export function encodeText(text: string): string {
  let bin = '';
  new TextEncoder().encode(text).forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeText(encoded: string): string {
  const bin = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeHash({ source, details }: Shared): string {
  return '#src=' + encodeText(source) + (details.trim() ? '&details=' + encodeText(details) : '');
}

/** The diagram carried in a share link, if the page was opened from one. */
export function sharedFromHash(hash: string): Shared | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const src = params.get('src');
  if (!src) return null;
  try {
    const details = params.get('details');
    return { source: decodeText(src), details: details ? decodeText(details) : '' };
  } catch {
    return null;
  }
}

/** Shows the Copy link button and copies a link carrying the source and details. */
export function bindShareButton(get: () => Shared): void {
  const button = byId('share', HTMLButtonElement);
  button.hidden = false;
  button.addEventListener('click', async () => {
    const url = location.href.split('#')[0] + encodeHash(get());
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied';
    } catch {
      button.textContent = 'Link is in the address bar';
    }
    setTimeout(() => {
      button.textContent = 'Copy link';
    }, 2000);
  });
}
