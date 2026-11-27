import assert from 'node:assert/strict'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createAcpInteractionSigner } from '../src/acp-interaction.mjs'

test('binds ACP proofs to recent native input and the focused main runtime frame', async () => {
  let time = 1000
  let focused = true
  const url = 'dsh-runtime://app/'
  const frame = { url }
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isFocused: () => focused,
    webContents: Object.assign(new EventEmitter(), { mainFrame: frame, getURL: () => url }),
  })
  const signer = createAcpInteractionSigner(window, () => time)
  const event = { sender: window.webContents, senderFrame: frame }
  const body = JSON.stringify({ sessionId: 'synthetic', text: 'example' })
  assert.equal(signer.issue(event, 'prompt', body), undefined)

  window.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'Enter' })
  assert.equal(signer.issue({ ...event, senderFrame: { url } }, 'prompt', body), undefined)
  const proof = signer.issue(event, 'prompt', body)
  assert.ok(proof)
  const [encoded, signature] = proof.split('.')
  const payload = Buffer.from(encoded, 'base64url')
  const key = createPublicKey({ key: Buffer.from(signer.publicKeyBase64, 'base64'), format: 'der', type: 'spki' })
  assert.equal(verify(null, payload, key, Buffer.from(signature, 'base64url')), true)
  assert.deepEqual(JSON.parse(payload), {
    issuedAt: time,
    nonce: JSON.parse(payload).nonce,
    operation: 'prompt',
    bodyHash: createHash('sha256').update(body).digest('hex'),
  })
  assert.equal(signer.issue(event, 'prompt', body), undefined)
  assert.ok(signer.issue(event, 'start', body))

  window.webContents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' })
  focused = false
  window.emit('blur')
  focused = true
  assert.equal(signer.issue(event, 'start', body), undefined)
  window.webContents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' })
  time += 5000
  assert.equal(signer.issue(event, 'start', body), undefined)

  const challenge = 'fixture-challenge-with-known-id'
  let confirmationCount = 0
  const reject = async () => { confirmationCount++; return false }
  assert.equal(await signer.confirmMcpAppTool(event, challenge, reject), undefined)
  assert.equal(confirmationCount, 0)
  window.webContents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' })
  assert.equal(await signer.confirmMcpAppTool(event, challenge, reject), undefined)
  assert.equal(await signer.confirmMcpAppTool(event, challenge, reject), undefined)
  assert.equal(confirmationCount, 1)
  window.webContents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' })
  const approval = await signer.confirmMcpAppTool(event, challenge, async id => id === challenge)
  assert.ok(approval)
  const [approvalBody, approvalSignature] = approval.split('.')
  const approvalPayload = Buffer.from(approvalBody, 'base64url')
  assert.equal(verify(null, approvalPayload, key, Buffer.from(approvalSignature, 'base64url')), true)
  assert.deepEqual(JSON.parse(approvalPayload), { kind: 'mcp-app-tool-approval', challengeId: challenge, issuedAt: time })

  assert.equal(await signer.confirmCheckpointRestore({ ...event, senderFrame: { url } }, challenge, reject), undefined)
  assert.equal(confirmationCount, 1)
  const decision = Promise.withResolvers()
  window.webContents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' })
  const pending = signer.confirmCheckpointRestore(event, challenge, id => {
    assert.equal(id, challenge)
    return decision.promise
  })
  assert.equal(await signer.confirmMcpAppTool(event, challenge, reject), undefined)
  assert.equal(confirmationCount, 1)
  time += 1000
  decision.resolve(true)
  const [restoreBody, restoreSignature] = (await pending).split('.')
  const restorePayload = Buffer.from(restoreBody, 'base64url')
  assert.equal(verify(null, restorePayload, key, Buffer.from(restoreSignature, 'base64url')), true)
  assert.deepEqual(JSON.parse(restorePayload), { kind: 'checkpoint-restore-approval', challengeId: challenge, issuedAt: time })
  assert.equal(await signer.confirmCheckpointRestore(event, challenge, reject), undefined)

  window.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'Enter' })
  const navigation = signer.confirmCheckpointRestore(event, challenge, async () => {
    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    return true
  })
  assert.equal(await navigation, undefined)
})
