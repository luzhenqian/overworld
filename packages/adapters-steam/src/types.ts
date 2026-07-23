/**
 * A minimal FlushableStorage-shaped save backend, structurally compatible
 * with `@overworld-engine/platform`'s `FlushableStorage` (same method
 * shapes) without importing that package — this package only depends on
 * `@overworld-engine/core`, per the repo's zero-cross-package-import rule.
 */
export interface SteamFlushableStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
  flush(): Promise<void>
}

/** The Steam capability bridge returned by {@link createSteamBridge}. */
export interface SteamBridge {
  /**
   * Whether the last {@link SteamBridge.ready} call successfully initialized
   * the Steamworks SDK. Synchronous; `false` before `ready()` resolves and
   * whenever the app isn't running under Steam (`steam_appid.txt` missing,
   * not launched via the Steam client, etc).
   */
  isAvailable(): boolean
  /**
   * Attempt Steamworks initialization (a Tauri `invoke` round-trip).
   * Resolves to the same value {@link SteamBridge.isAvailable} then returns.
   * Call and await this once at startup, before using the rest of the API.
   */
  ready(): Promise<boolean>
  /** No-op when unavailable. Fire-and-forget — does not report failures. */
  unlockAchievement(id: string): void
  /** No-op when unavailable. */
  clearAchievement(id: string): void
  /** No-op when unavailable. */
  setStat(name: string, value: number): void
  /**
   * Steam Cloud-backed save storage, hydrated during {@link SteamBridge.ready}.
   * `undefined` when unavailable — callers fall back explicitly:
   * `steam.cloudStorage() ?? bridge.storage()`.
   */
  cloudStorage(): SteamFlushableStorage | undefined
  /** No-op when unavailable. */
  setRichPresence(key: string, value: string): void
  /** No-op when unavailable. */
  clearRichPresence(): void
}
