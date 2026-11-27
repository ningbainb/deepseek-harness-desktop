import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { expect, it } from 'vitest'
import { createAcpInteractionVerifier } from '../src/acp/interaction-proof.ts'

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const issuedAt = 100_000

function signRequest(operation: string, raw: string, time = issuedAt) {
  const body = Buffer.from(JSON.stringify({
    issuedAt: time,
    nonce: randomUUID(),
    operation,
    bodyHash: createHash('sha256').update(raw, 'utf8').digest('hex'),
  }))
  return body.toString('base64url') + '.' + sign(null, body, keys.privateKey).toString('base64url')
}

it('accepts a single Desktop gesture only for the signed operation and exact request body', () => {
  const verify = createAcpInteractionVerifier(publicKey, () => issuedAt + 100)
  const raw = '{"sessionId":"abc","text":"你好"}'
  const proof = signRequest('prompt', raw)
  expect(verify('start', raw, proof)).toBe(false)
  expect(verify('prompt', raw + '\n', proof)).toBe(false)
  expect(verify('prompt', raw, proof)).toBe(true)
  expect(verify('prompt', raw, proof)).toBe(false)
})

it('rejects missing, invalid, stale, and future Desktop proofs', () => {
  const verify = createAcpInteractionVerifier(publicKey, () => issuedAt)
  const raw = '{"sessionId":"abc"}'
  expect(verify('start', raw, undefined)).toBe(false)
  expect(verify('start', raw, 'forged.proof')).toBe(false)
  expect(verify('start', raw, signRequest('start', raw, issuedAt - 10_000))).toBe(false)
  expect(verify('start', raw, signRequest('start', raw, issuedAt + 1))).toBe(false)
  expect(createAcpInteractionVerifier('malformed', () => issuedAt)('start', raw, signRequest('start', raw))).toBe(false)
})
