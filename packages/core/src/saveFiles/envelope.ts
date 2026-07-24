/**
 * A minimal integrity envelope wrapped around opaque save-file bytes:
 * physical corruption/truncation detection only, independent of any
 * business-level checksum the caller's own save format defines.
 *
 * Layout: `[4B magic "OWSF"][1B format version][4B payload length (LE
 * u32)][32B SHA-256(payload)][payload bytes]`.
 */

const MAGIC = new Uint8Array([0x4f, 0x57, 0x53, 0x46]) // "OWSF"
const FORMAT_VERSION = 1
const DIGEST_LENGTH = 32
const HEADER_LENGTH = MAGIC.length + 1 + 4 + DIGEST_LENGTH // 41

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/** Byte-for-byte equality; used for digest comparison and read-back verification. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Wrap `payload` in the integrity envelope described above. */
export async function wrapEnvelope(payload: Uint8Array): Promise<Uint8Array> {
  const digest = await sha256(payload)
  const out = new Uint8Array(HEADER_LENGTH + payload.byteLength)
  out.set(MAGIC, 0)
  out[MAGIC.length] = FORMAT_VERSION
  new DataView(out.buffer).setUint32(MAGIC.length + 1, payload.byteLength, true)
  out.set(digest, MAGIC.length + 1 + 4)
  out.set(payload, HEADER_LENGTH)
  return out
}

/**
 * Unwrap an envelope produced by {@link wrapEnvelope}. Returns `null` (never
 * throws) for anything that doesn't check out — wrong magic, wrong format
 * version, length mismatch, or a SHA-256 mismatch — so callers can treat any
 * failure uniformly as "this generation is not usable, try the next one".
 */
export async function unwrapEnvelope(raw: Uint8Array): Promise<Uint8Array | null> {
  if (raw.byteLength < HEADER_LENGTH) return null
  for (let i = 0; i < MAGIC.length; i++) {
    if (raw[i] !== MAGIC[i]) return null
  }
  if (raw[MAGIC.length] !== FORMAT_VERSION) return null

  const length = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(MAGIC.length + 1, true)
  if (HEADER_LENGTH + length !== raw.byteLength) return null

  const storedDigest = raw.slice(MAGIC.length + 1 + 4, HEADER_LENGTH)
  const payload = raw.slice(HEADER_LENGTH)
  const actualDigest = await sha256(payload)
  if (!bytesEqual(storedDigest, actualDigest)) return null

  return payload
}
