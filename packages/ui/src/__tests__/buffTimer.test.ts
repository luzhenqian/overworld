import { describe, expect, test } from 'vitest'
import { buffSweepPct, formatBuffTime } from '../buffTimer'

describe('buffSweepPct', () => {
  test('returns the remaining fraction as a percentage', () => {
    expect(buffSweepPct(3, 12)).toBe(25)
  })
  test('clamps to 0–100', () => {
    expect(buffSweepPct(20, 12)).toBe(100)
    expect(buffSweepPct(-1, 12)).toBe(0)
  })
  test('duration <= 0 means permanent (no sweep)', () => {
    expect(buffSweepPct(5, 0)).toBe(0)
  })
  test('negative duration is permanent (0)', () => {
    expect(buffSweepPct(5, -3)).toBe(0)
  })
})

describe('formatBuffTime', () => {
  test('minutes:seconds above 60s, zero-padded', () => {
    expect(formatBuffTime(83)).toBe('1:23')
    expect(formatBuffTime(60)).toBe('1:00')
    expect(formatBuffTime(125)).toBe('2:05')
  })
  test('whole seconds with "s" from 10 to 59', () => {
    expect(formatBuffTime(45)).toBe('45s')
    expect(formatBuffTime(10)).toBe('10s')
    expect(formatBuffTime(12.4)).toBe('12s')
  })
  test('one decimal, no unit, below 10s', () => {
    expect(formatBuffTime(9.9)).toBe('9.9')
    expect(formatBuffTime(3.2)).toBe('3.2')
    expect(formatBuffTime(0.4)).toBe('0.4')
  })
  test('empty string at or below zero', () => {
    expect(formatBuffTime(0)).toBe('')
    expect(formatBuffTime(-5)).toBe('')
  })
  test('rounds up across a bucket boundary into the higher bucket', () => {
    expect(formatBuffTime(59.5)).toBe('1:00')
    expect(formatBuffTime(9.97)).toBe('10s')
  })
})
