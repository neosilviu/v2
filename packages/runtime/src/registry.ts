export class Registry<T extends { id: string }> {
  readonly #items = new Map<string, T>();

  register(item: T): T {
    this.#items.set(item.id, item);
    return item;
  }

  unregister(id: string): boolean {
    return this.#items.delete(id);
  }

  get(id: string): T | undefined {
    return this.#items.get(id);
  }

  all(): T[] {
    return [...this.#items.values()];
  }
}
