import { describe, expect, test } from 'vitest'
import { newlyUnlocked } from '../achievementDiff'

describe('newlyUnlocked', () => {
  test('returns ids present in next but not prev', () => {
    expect(newlyUnlocked({ a: 1 }, { a: 1, b: 2, c: 3 })).toEqual(['b', 'c'])
  })

  test('no changes yields empty array', () => {
    expect(newlyUnlocked({ a: 1 }, { a: 1 })).toEqual([])
    expect(newlyUnlocked({}, {})).toEqual([])
  })
})
