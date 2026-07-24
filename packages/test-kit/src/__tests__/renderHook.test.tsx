import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '../renderHook'

function useMountEffect(onMount: () => void, onCleanup: () => void): void {
  useEffect(() => {
    onMount()
    return onCleanup
  }, [])
}

describe('renderHook', () => {
  it('mounts the hook and runs its effect', () => {
    const onMount = vi.fn()
    const onCleanup = vi.fn()

    renderHook(useMountEffect, onMount, onCleanup)

    expect(onMount).toHaveBeenCalledTimes(1)
    expect(onCleanup).not.toHaveBeenCalled()
  })

  it('unmount() runs the effect cleanup', () => {
    const onMount = vi.fn()
    const onCleanup = vi.fn()

    const { unmount } = renderHook(useMountEffect, onMount, onCleanup)
    unmount()

    expect(onCleanup).toHaveBeenCalledTimes(1)
  })

  it('passes through arguments to the hook', () => {
    const received: unknown[] = []
    function useCapture(a: number, b: string): void {
      useEffect(() => {
        received.push(a, b)
      }, [])
    }

    renderHook(useCapture, 42, 'hello')

    expect(received).toEqual([42, 'hello'])
  })
})
