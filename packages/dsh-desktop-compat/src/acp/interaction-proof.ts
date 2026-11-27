import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto'

export const ACP_GESTURE_PUBLIC_KEY_ENV = 'DSH_DESKTOP_ACP_GESTURE_PUBLIC_KEY'
export const ACP_INTERACTION_HEADER = 'x-dsh-acp-interaction'

const MAX_PROOF_AGE_MS = 10_000
const MAX_TRACKED_PROOFS = 4096
const TOKEN_PARTS = /^([A-Za-z0-9_-]{1,512})[.]([A-Za-z0-9_-]{86})$/u
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export type AcpInteractionOperation = 'start' | 'prompt'

export function createAcpInteractionVerifier(publicKey: string, now = Date.now) {
  let key: KeyObject | undefined
  try {
    const candidate = createPublicKey({ key: Buffer.from(publicKey, 'base64'), type: 'spki', format: 'der' })
    if (candidate.asymmetricKeyType === 'ed25519') key = candidate
  } catch {}
  const used = new Map<string, number>()

  return (operation: AcpInteractionOperation, requestBody: string, token: string | string[] | undefined): boolean => {
    if (!key || typeof token !== 'string') return false
    const match = TOKEN_PARTS.exec(token)
    if (!match) return false
    try {
      const bytes = Buffer.from(match[1], 'base64url')
      const signature = Buffer.from(match[2], 'base64url')
      if (bytes.toString('base64url') !== match[1] || signature.toString('base64url') !== match[2]) return false
      if (!verify(null, bytes, key, signature)) return false
      const data = JSON.parse(bytes.toString('utf8')) as {
        issuedAt?: number
        nonce?: string
        operation?: string
        bodyHash?: string
      }
      const currentTime = now()
      if (typeof data.issuedAt !== 'number' || !Number.isSafeInteger(data.issuedAt)
        || data.issuedAt > currentTime || data.issuedAt <= currentTime - MAX_PROOF_AGE_MS
        || data.operation !== operation || typeof data.nonce !== 'string' || !NONCE.test(data.nonce)
        || data.bodyHash !== createHash('sha256').update(requestBody, 'utf8').digest('hex')) return false
      for (const [nonce, expiresAt] of used) {
        if (expiresAt <= currentTime) used.delete(nonce)
      }
      if (used.has(data.nonce) || used.size >= MAX_TRACKED_PROOFS) return false
      used.set(data.nonce, data.issuedAt + MAX_PROOF_AGE_MS)
      return true
    } catch {
      return false
    }
  }
}
