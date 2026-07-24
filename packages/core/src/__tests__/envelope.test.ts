import { describe, expect, it } from 'vitest'
import { bytesEqual, unwrapEnvelope, wrapEnvelope } from '../saveFiles/envelope'

describe('wrapEnvelope / unwrapEnvelope', () => {
  it('round-trips payload bytes', async () => {
    const payload = new TextEncoder().encode('hello save file')
    const envelope = await wrapEnvelope(payload)
    const unwrapped = await unwrapEnvelope(envelope)

    expect(unwrapped).not.toBeNull()
    expect(bytesEqual(unwrapped!, payload)).toBe(true)
  })

  it('round-trips an empty payload', async () => {
    const payload = new Uint8Array(0)
    const envelope = await wrapEnvelope(payload)
    const unwrapped = await unwrapEnvelope(envelope)
    expect(unwrapped).toEqual(payload)
  })

  it('rejects a buffer too short to contain a header', async () => {
    expect(await unwrapEnvelope(new Uint8Array(10))).toBeNull()
  })

  it('rejects wrong magic bytes', async () => {
    const envelope = await wrapEnvelope(new TextEncoder().encode('data'))
    envelope[0] = 0x00
    expect(await unwrapEnvelope(envelope)).toBeNull()
  })

  it('rejects a bit-flipped payload (checksum mismatch)', async () => {
    const envelope = await wrapEnvelope(new TextEncoder().encode('data'))
    envelope[envelope.length - 1] ^= 0xff
    expect(await unwrapEnvelope(envelope)).toBeNull()
  })

  it('rejects a truncated buffer (length mismatch)', async () => {
    const envelope = await wrapEnvelope(new TextEncoder().encode('data'))
    expect(await unwrapEnvelope(envelope.slice(0, envelope.length - 1))).toBeNull()
  })
})

describe('bytesEqual', () => {
  it('compares by content, not identity or length-prefix', () => {
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})
