// A minimal typed event emitter. Subclasses call emit(); anyone can subscribe with on().

type Listener<T> = (payload: T) => void;

export class Emitter<E extends Record<string, unknown>> {
  private listeners = new Map<keyof E, Set<Listener<never>>>();

  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => set.delete(fn as Listener<never>);
  }

  protected emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.listeners.get(type)?.forEach((fn) => (fn as Listener<E[K]>)(payload));
  }
}
