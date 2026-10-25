import type { Adapter } from '../types';
import { mermaidAdapter } from './mermaid';

// Checked in order; the first adapter that can handle the source wins.
// Register more specific adapters before Mermaid, which accepts anything.
const adapters: Adapter[] = [mermaidAdapter];

export function registerAdapter(adapter: Adapter): void {
  adapters.unshift(adapter);
}

export function pickAdapter(src: string): Adapter {
  return adapters.find((a) => a.canHandle(src)) ?? mermaidAdapter;
}
