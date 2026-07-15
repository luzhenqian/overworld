/**
 * Save-slot management on top of the key/value persistence layer.
 *
 * Every Overworld store persists under `${prefix}:<name>` (see
 * `persistOptions`). The set of all those keys is the **live save** — the
 * game currently in progress. `createSaveSlots` copies that live save into
 * named slots (stored as JSON under `${prefix}:slots:<slot>`), restores a
 * slot back into the live keys, and clears the live save for a new game.
 */

/**
 * Minimal synchronous storage that can also enumerate its keys.
 *
 * zustand's `StateStorage` cannot list keys, which save-slot management
 * needs; this interface adds `keys()`. It is structurally compatible with
 * `StateStorage`, so one backend (e.g. `createMemoryStorage()`) can serve
 * both `persistOptions` and `createSaveSlots`. Wrap a DOM `Storage`
 * (localStorage/sessionStorage) with {@link fromWebStorage}.
 */
export interface EnumerableStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  /** All keys currently present in the storage. */
  keys: () => string[]
}

/** A point-in-time copy of the live save. */
export interface SaveSnapshot {
  /** Epoch ms at which the snapshot was taken. */
  savedAt: number
  /** Raw storage entries, keyed by their full storage key. */
  entries: Record<string, string>
}

/** Summary of one stored slot, as returned by {@link SaveSlots.listSlots}. */
export interface SaveSlotInfo {
  slot: string
  /** Epoch ms at which the slot was saved. */
  savedAt: number
}

/** Configuration for {@link createSaveSlots}. */
export interface SaveSlotsConfig {
  /**
   * Storage backend. Defaults to `localStorage` (via {@link fromWebStorage});
   * required in non-browser environments.
   */
  storage?: EnumerableStorage
  /**
   * Key prefix shared with `persistOptions`. Defaults to `overworld`. Keys
   * outside `${prefix}:` are never read, written or deleted.
   */
  prefix?: string
}

/** Save-slot manager; see {@link createSaveSlots}. */
export interface SaveSlots {
  /** Copy the current live save (all `${prefix}:` keys outside the slot namespace). */
  snapshot: () => SaveSnapshot
  /**
   * Replace the live save with a snapshot: current live keys are removed
   * first, then the snapshot's entries are written back.
   *
   * Note: zustand stores that already hydrated keep their in-memory state —
   * the restored data only becomes visible after the game reloads or calls
   * each store's `persist.rehydrate()`.
   */
  restore: (snapshot: SaveSnapshot) => void
  /** Save the current live save into a named slot (overwrites the slot). */
  saveTo: (slot: string) => void
  /**
   * Restore a named slot into the live save. Returns `false` (and leaves the
   * live save untouched) when the slot does not exist or is corrupt. The
   * rehydration caveat of {@link SaveSlots.restore} applies.
   */
  loadFrom: (slot: string) => boolean
  /** Delete a named slot. Missing slots are a no-op. */
  deleteSlot: (slot: string) => void
  /** List stored slots, most recently saved first. */
  listSlots: () => SaveSlotInfo[]
  /** Delete the live save ("new game"). Slots are untouched. */
  clearCurrent: () => void
}

/**
 * Wrap a DOM `Storage` (localStorage, sessionStorage) as an
 * {@link EnumerableStorage}. This is the default adapter used by
 * {@link createSaveSlots} in the browser.
 */
export function fromWebStorage(storage: Storage): EnumerableStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      storage.setItem(key, value)
    },
    removeItem: (key) => {
      storage.removeItem(key)
    },
    keys: () => {
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key !== null) keys.push(key)
      }
      return keys
    },
  }
}

function defaultStorage(): EnumerableStorage {
  if (typeof localStorage === 'undefined') {
    throw new Error(
      '[overworld] createSaveSlots: localStorage is not available in this environment; pass config.storage'
    )
  }
  return fromWebStorage(localStorage)
}

/**
 * Create a save-slot manager over the game's persisted state:
 *
 * ```ts
 * const slots = createSaveSlots()
 * slots.saveTo('slot-1')          // copy the live save into a slot
 * slots.clearCurrent()            // new game
 * slots.loadFrom('slot-1')        // bring the slot back
 * slots.listSlots()               // [{ slot: 'slot-1', savedAt: ... }]
 * ```
 *
 * The live save is every key under `${prefix}:` **except** the slot
 * namespace `${prefix}:slots:`, so it automatically covers every store
 * persisted through `persistOptions` with the same prefix.
 *
 * Restoring (via `restore` or `loadFrom`) only rewrites storage —
 * already-hydrated zustand stores keep their in-memory state until the game
 * reloads or calls each store's `persist.rehydrate()`.
 */
export function createSaveSlots(config?: SaveSlotsConfig): SaveSlots {
  const storage = config?.storage ?? defaultStorage()
  const prefix = config?.prefix ?? 'overworld'
  const livePrefix = `${prefix}:`
  const slotPrefix = `${prefix}:slots:`

  const isLiveKey = (key: string): boolean => key.startsWith(livePrefix) && !key.startsWith(slotPrefix)
  const liveKeys = (): string[] => storage.keys().filter(isLiveKey)
  const slotKey = (slot: string): string => `${slotPrefix}${slot}`

  const parseSnapshot = (raw: string | null): SaveSnapshot | null => {
    if (raw === null) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as SaveSnapshot).savedAt === 'number' &&
        typeof (parsed as SaveSnapshot).entries === 'object' &&
        (parsed as SaveSnapshot).entries !== null
      ) {
        return parsed as SaveSnapshot
      }
    } catch {
      // fall through
    }
    return null
  }

  const snapshot = (): SaveSnapshot => {
    const entries: Record<string, string> = {}
    for (const key of liveKeys()) {
      const value = storage.getItem(key)
      if (value !== null) entries[key] = value
    }
    return { savedAt: Date.now(), entries }
  }

  const clearCurrent = (): void => {
    for (const key of liveKeys()) storage.removeItem(key)
  }

  const restore = (snap: SaveSnapshot): void => {
    clearCurrent()
    for (const [key, value] of Object.entries(snap.entries)) {
      // Never let a (hand-crafted) snapshot write into the slot namespace.
      if (!isLiveKey(key)) continue
      storage.setItem(key, value)
    }
  }

  return {
    snapshot,
    restore,
    clearCurrent,

    saveTo: (slot) => {
      storage.setItem(slotKey(slot), JSON.stringify(snapshot()))
    },

    loadFrom: (slot) => {
      const snap = parseSnapshot(storage.getItem(slotKey(slot)))
      if (!snap) return false
      restore(snap)
      return true
    },

    deleteSlot: (slot) => {
      storage.removeItem(slotKey(slot))
    },

    listSlots: () => {
      const infos: SaveSlotInfo[] = []
      for (const key of storage.keys()) {
        if (!key.startsWith(slotPrefix)) continue
        const snap = parseSnapshot(storage.getItem(key))
        infos.push({ slot: key.slice(slotPrefix.length), savedAt: snap?.savedAt ?? 0 })
      }
      return infos.sort((a, b) => b.savedAt - a.savedAt)
    },
  }
}
