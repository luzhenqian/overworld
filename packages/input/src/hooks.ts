import { useEffect, useRef } from 'react'
import { inputLock } from '@overworld-engine/core'
import { KEYBOARD_PRIORITY, useKeyboardStore } from './keyboardStore'

/** Normalize the overloaded `useKeyboardLayer` options into a flat shape. */
export function parseLayerOpts(
  opts?: string[] | { blockedKeys?: string[]; lockInput?: boolean }
): { blockedKeys?: string[]; lockInput: boolean } {
  if (Array.isArray(opts)) return { blockedKeys: opts, lockInput: false }
  return { blockedKeys: opts?.blockedKeys, lockInput: Boolean(opts?.lockInput) }
}

/**
 * Register a keyboard layer for the lifetime of the calling component:
 * registers on mount (and when `id`/`priority`/`blockedKeys` change),
 * unregisters on unmount. Pass `{ lockInput: true }` to also acquire the
 * shared `inputLock` (from `@overworld-engine/core`) for the layer's
 * lifetime — e.g. to suppress the virtual joystick during a cutscene.
 *
 * ```tsx
 * function DialogueOverlay() {
 *   useKeyboardLayer('dialogue', KEYBOARD_PRIORITY.NPC_DIALOGUE, { lockInput: true })
 *   ...
 * }
 * ```
 */
export function useKeyboardLayer(
  id: string,
  priority: number,
  opts?: string[] | { blockedKeys?: string[]; lockInput?: boolean }
): void {
  const { blockedKeys, lockInput } = parseLayerOpts(opts)
  // Serialize so a fresh (but equal) array literal doesn't churn the effect.
  const blockedKeysKey = blockedKeys ? JSON.stringify(blockedKeys) : undefined

  useEffect(() => {
    const store = useKeyboardStore.getState()
    store.registerLayer({
      id,
      priority,
      blockedKeys: blockedKeysKey ? (JSON.parse(blockedKeysKey) as string[]) : undefined,
    })
    if (lockInput) inputLock.acquire(id)
    return () => {
      useKeyboardStore.getState().unregisterLayer(id)
      if (lockInput) inputLock.release(id)
    }
  }, [id, priority, blockedKeysKey, lockInput])
}

/** Options for {@link useHotkey}. */
export interface UseHotkeyOptions {
  /**
   * Priority the handler runs at; higher-priority layers can block it.
   * Defaults to `KEYBOARD_PRIORITY.DEFAULT`.
   */
  priority?: number
  /** Disable the hotkey without unmounting. Defaults to `true`. */
  enabled?: boolean
  /** Call `event.preventDefault()` when handled. Defaults to `true`. */
  preventDefault?: boolean
  /** Ignore key presses originating from editable elements. Defaults to `true`. */
  ignoreInputs?: boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

/**
 * Bind a keydown handler that respects the keyboard layer stack: the handler
 * only fires when `shouldHandleKey(key, priority)` allows it.
 *
 * ```tsx
 * useHotkey('e', () => interact(), { priority: KEYBOARD_PRIORITY.GAME_CONTROLS })
 * ```
 */
export function useHotkey(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {}
): void {
  const {
    priority = KEYBOARD_PRIORITY.DEFAULT,
    enabled = true,
    preventDefault = true,
    ignoreInputs = true,
  } = options

  // Keep the latest handler without re-binding the listener each render.
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      if (ignoreInputs && isEditableTarget(event.target)) return
      if (!useKeyboardStore.getState().shouldHandleKey(event.key, priority)) return
      if (preventDefault) event.preventDefault()
      handlerRef.current(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, priority, enabled, preventDefault, ignoreInputs])
}
