/** Looks up an element by id and checks its type, failing loudly if the markup changed. */
export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing #${id} (${type.name})`);
  return el;
}

/** True when a key press is meant for a form control rather than the player. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
}
