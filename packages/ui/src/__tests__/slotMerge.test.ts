import { describe, expect, test, vi } from 'vitest'
import { mergeProps, mergeRefs } from '../primitives/Slot'

describe('mergeProps', () => {
  test('concatenates className when both sides have one', () => {
    expect(mergeProps({ className: 'ow-button' }, { className: 'user-class' })).toMatchObject({
      className: 'ow-button user-class',
    })
  })

  test('keeps slot className when child has none', () => {
    expect(mergeProps({ className: 'ow-button' }, {})).toMatchObject({ className: 'ow-button' })
  })

  test('merges style with child values winning per-key', () => {
    const merged = mergeProps({ style: { color: 'red', fontSize: 12 } }, { style: { color: 'blue' } })
    expect(merged.style).toEqual({ color: 'blue', fontSize: 12 })
  })

  test('calls both event handlers, slot first then child', () => {
    const calls: string[] = []
    const slotOnClick = () => calls.push('slot')
    const childOnClick = () => calls.push('child')
    const merged = mergeProps({ onClick: slotOnClick }, { onClick: childOnClick })
    ;(merged.onClick as () => void)()
    expect(calls).toEqual(['slot', 'child'])
  })

  test('non-special keys fall back to child value when present', () => {
    expect(mergeProps({ 'data-ow-variant': 'primary' }, { 'data-ow-variant': 'ghost' })).toMatchObject({
      'data-ow-variant': 'ghost',
    })
  })

  test('non-special keys fall back to slot value when child omits them', () => {
    expect(mergeProps({ 'data-ow-variant': 'primary' }, {})).toMatchObject({ 'data-ow-variant': 'primary' })
  })
})

describe('mergeRefs', () => {
  test('assigns object refs', () => {
    const refA = { current: null }
    const refB = { current: null }
    mergeRefs(refA, refB)('node' as unknown as null)
    expect(refA.current).toBe('node')
    expect(refB.current).toBe('node')
  })

  test('calls function refs', () => {
    const fnA = vi.fn()
    const fnB = vi.fn()
    mergeRefs(fnA, fnB)('node' as unknown as null)
    expect(fnA).toHaveBeenCalledWith('node')
    expect(fnB).toHaveBeenCalledWith('node')
  })

  test('ignores undefined refs', () => {
    const refA = { current: null }
    expect(() => mergeRefs(refA, undefined)('node' as unknown as null)).not.toThrow()
    expect(refA.current).toBe('node')
  })
})
