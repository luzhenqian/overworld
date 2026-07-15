import { useEffect, useRef } from 'react'
import { KEYBOARD_PRIORITY, useKeyboardStore } from './keyboardStore'

/**
 * Register a keyboard layer for the lifetime of the calling component:
 * registers on mount (and when `id`/`priority`/`blockedKeys` change),
 * unregisters on unmount.
 *
 * ```tsx
 * function DialogueOverlay() {
 *   useKeyboardLayer('dialogue', KEYBOARD_PRIORITY.NPC_DIALOGUE)
 *   ...
 * }
 * ```
 */
export function useKeyboardLayer(id: string, priority: number, blockedKeys?: string[]): void {
  // Serialize so a fresh (but equal) array literal doesn't churn the effect.
  const blockedKeysKey = blockedKeys ? JSON.stringify(blockedKeys) : undefined

  useEffect(() => {
    const store = useKeyboardStore.getState()
    store.registerLayer({
      id,
      priority,
      blockedKeys: blockedKeysKey ? (JSON.parse(blockedKeysKey) as string[]) : undefined,
    })
    return () => useKeyboardStore.getState().unregisterLayer(id)
  }, [id, priority, blockedKeysKey])
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
