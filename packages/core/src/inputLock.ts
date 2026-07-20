/**
 * Headless, framework-agnostic input lock: a single source of truth for
 * "gameplay input is suspended" that every input source (keyboard, joystick,
 * interact key, camera drag, future sources) can consult without importing
 * one another. Modals/dialogues acquire a named lock; sources check
 * {@link InputLock.isLocked}.
 *
 * Pure TypeScript — no react/zustand/three. React bindings live in `scene`.
 */
import { gameEvents, type EventBus } from './events'

export interface InputLock {
  /** Acquire a named lock (idempotent per id). */
  acquire(id: string): void
  /** Release a named lock (idempotent). */
  release(id: string): void
  /** True when any lock is held. */
  isLocked(): boolean
  /** Held lock ids, stably sorted. */
  activeLocks(): string[]
  /** Subscribe to lock-state changes; returns an unsubscribe function. */
  subscribe(fn: (locked: boolean, active: string[]) => void): () => void
  /** Release every lock (scene change / test cleanup). */
  releaseAll(): void
}

/** Create an isolated input lock bound to a specific bus (for tests/engines). */
export function createInputLock(bus: EventBus<any> = gameEvents): InputLock {
  const held = new Set<string>()
  const subs = new Set<(locked: boolean, active: string[]) => void>()

  const active = () => [...held].sort()

  const notify = () => {
    const locked = held.size > 0
    const list = active()
    bus.emit('input:lock-changed', { locked, active: list })
    for (const fn of subs) fn(locked, list)
  }

  return {
    acquire(id) {
      if (held.has(id)) return
      held.add(id)
      notify()
    },
    release(id) {
      if (!held.delete(id)) return
      notify()
    },
    isLocked: () => held.size > 0,
    activeLocks: active,
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    releaseAll() {
      if (held.size === 0) return
      held.clear()
      notify()
    },
  }
}

/** Global input lock, bound to the default `gameEvents` bus. */
export const inputLock: InputLock = createInputLock()
