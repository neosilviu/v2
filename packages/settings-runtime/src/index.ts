export type SettingScope = "platform" | `plugin:${string}`;
export type SettingKey = {
  workspaceId: string;
  scope: SettingScope;
  key: string;
};

export interface SettingsStore {
  get(input: SettingKey): Promise<unknown | undefined>;
  set(input: SettingKey, value: unknown): Promise<void>;
  list(
    workspaceId: string,
    scope: SettingScope,
  ): Promise<Record<string, unknown>>;
}

export class MemorySettingsStore implements SettingsStore {
  readonly #values = new Map<string, unknown>();
  #id(input: SettingKey) {
    return `${input.workspaceId}:${input.scope}:${input.key}`;
  }
  async get(input: SettingKey) {
    return this.#values.get(this.#id(input));
  }
  async set(input: SettingKey, value: unknown) {
    this.#values.set(this.#id(input), value);
  }
  async list(workspaceId: string, scope: SettingScope) {
    const prefix = `${workspaceId}:${scope}:`;
    return Object.fromEntries(
      [...this.#values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]),
    );
  }
}
