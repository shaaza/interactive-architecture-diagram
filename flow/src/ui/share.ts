import { byId } from './dom';

const HASH_RE = /^#src=([A-Za-z0-9_-]+)/;

/** UTF-8 safe, URL-safe base64 without padding. */
export function encodeSrc(src: string): string {
  let bin = '';
  new TextEncoder().encode(src).forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSrc(encoded: string): string {
  const bin = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The diagram source carried in a share link, if the page was opened from one. */
export function srcFromHash(hash: string): string | null {
  const m = HASH_RE.exec(hash);
  if (!m?.[1]) return null;
  try {
    return decodeSrc(m[1]);
  } catch {
    return null;
  }
}

/** Shows the Copy link button and copies a link with the current source in its hash. */
export function bindShareButton(getSrc: () => string): void {
  const button = byId('share', HTMLButtonElement);
  button.hidden = false;
  button.addEventListener('click', async () => {
    const url = location.href.split('#')[0] + '#src=' + encodeSrc(getSrc());
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
