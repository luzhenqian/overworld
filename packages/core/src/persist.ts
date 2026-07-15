import { createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware'
import type { EnumerableStorage } from './saveSlots'

/**
 * Save-game persistence helpers. Engines persist through zustand's `persist`
 * middleware; these helpers standardize key naming, versioning/migration and
 * make the storage backend swappable (localStorage by default, memory for
 * tests/SSR, or a custom adapter for cloud saves).
 */

export interface OverworldPersistConfig<S, P = S> {
  /** Storage key, namespaced as `<prefix>:<name>`. */
  name: string
  /** Bump when the persisted shape changes; pair with `migrate`. */
  version?: number
  /** Key prefix. Defaults to `overworld`. */
  prefix?: string
  /** Storage backend factory. Defaults to `localStorage`. */
  storage?: () => StateStorage
  /** Select the subset of state worth saving. */
  partialize?: (state: S) => P
  migrate?: (persistedState: unknown, version: number) => P | Promise<P>
  onRehydrateStorage?: PersistOptions<S, P>['onRehydrateStorage']
}

/**
 * Build the options object for zustand's `persist` middleware:
 *
 * ```ts
 * create<State>()(persist(initializer, persistOptions({ name: 'inventory', version: 1 })))
 * ```
 */
export function persistOptions<S, P = S>(config: OverworldPersistConfig<S, P>): PersistOptions<S, P> {
  const options: PersistOptions<S, P> = {
    name: `${config.prefix ?? 'overworld'}:${config.name}`,
    version: config.version ?? 0,
  }
  if (config.storage) options.storage = createJSONStorage(config.storage)
  if (config.partialize) options.partialize = config.partialize
  if (config.migrate) options.migrate = config.migrate
  if (config.onRehydrateStorage) options.onRehydrateStorage = config.onRehydrateStorage
  return options
}

/**
 * In-memory storage — for tests and non-browser environments. Satisfies both
 * zustand's `StateStorage` (for `persistOptions`) and `EnumerableStorage`
 * (for `createSaveSlots`), so one instance can back both.
 */
export function createMemoryStorage(): EnumerableStorage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    keys: () => [...store.keys()],
  }
}
