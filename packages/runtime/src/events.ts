export type RuntimeEvent = { type: string; payload?: unknown; at: string };
export type EventHandler = (event: RuntimeEvent) => void | Promise<void>;

export class EventBus {
  readonly #handlers = new Map<string, Set<EventHandler>>();

  on(type: string, handler: EventHandler): () => void {
    const handlers = this.#handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.#handlers.set(type, handlers);
    return () => handlers.delete(handler);
  }

  async emit(type: string, payload?: unknown): Promise<void> {
    const event = { type, payload, at: new Date().toISOString() };
    await Promise.all([...(this.#handlers.get(type) ?? [])].map((handler) => handler(event)));
  }
}
