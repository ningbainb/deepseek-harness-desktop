import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'

const INPUT_WINDOW_MS = 5000
const MAX_BODY_BYTES = 256 * 1024

export function createAcpInteractionSigner(window, now = Date.now) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const contents = window.webContents
  const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  let lastInputAt = -Infinity
  let approvalPending = false
  let navigationGeneration = 0
  const issuedOperations = new Set()

  const resetInput = () => {
    lastInputAt = -Infinity
    issuedOperations.clear()
  }
  const recordInput = () => {
    if (!window.isFocused() || !/^dsh-runtime:\/\/app(?:[/?#]|$)/u.test(contents.getURL())) return
    lastInputAt = now()
    issuedOperations.clear()
  }
  window.on('blur', resetInput)
  contents.on('did-start-navigation', details => {
    if (details?.isMainFrame && !details.isSameDocument) {
      navigationGeneration++
      resetInput()
    }
  })
  contents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && (input.key === 'Enter' || input.key === ' ') && !input.isAutoRepeat) recordInput()
  })
  contents.on('before-mouse-event', (_event, input) => {
    if (input.type === 'mouseDown' && input.button === 'left') recordInput()
  })

  const runtimeFrame = event => !window.isDestroyed() && event.sender === contents
    && event.senderFrame === contents.mainFrame && /^dsh-runtime:\/\/app(?:[/?#]|$)/u.test(event.senderFrame?.url ?? '')
  const claimGesture = (event, operation, issuedAt) => {
    if (!runtimeFrame(event) || !window.isFocused()
      || issuedAt - lastInputAt >= INPUT_WINDOW_MS || issuedOperations.has(operation)) return false
    issuedOperations.add(operation)
    return true
  }
  const encode = value => {
    const payload = Buffer.from(JSON.stringify(value), 'utf8')
    return `${payload.toString('base64url')}.${sign(null, payload, privateKey).toString('base64url')}`
  }
  const confirmOperation = async (event, kind, challengeId, confirm) => {
    if (typeof challengeId !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/u.test(challengeId)
      || approvalPending || !claimGesture(event, kind, now())) return undefined
    const generation = navigationGeneration
    approvalPending = true
    try {
      if (!await confirm(challengeId) || generation !== navigationGeneration || !runtimeFrame(event)) return undefined
      return encode({ kind, challengeId, issuedAt: now() })
    } finally {
      approvalPending = false
    }
  }

  return {
    publicKeyBase64,
    issue(event, operation, bodyJson) {
      if (operation !== 'start' && operation !== 'prompt') return undefined
      if (typeof bodyJson !== 'string' || Buffer.byteLength(bodyJson, 'utf8') > MAX_BODY_BYTES) return undefined
      const issuedAt = now()
      if (!claimGesture(event, operation, issuedAt)) return undefined
      const bodyHash = createHash('sha256').update(bodyJson, 'utf8').digest('hex')
      return encode({ issuedAt, nonce: randomUUID(), operation, bodyHash })
    },
    confirmMcpAppTool: (event, challengeId, confirm) => confirmOperation(event, 'mcp-app-tool-approval', challengeId, confirm),
    confirmCheckpointRestore: (event, challengeId, confirm) => confirmOperation(event, 'checkpoint-restore-approval', challengeId, confirm),
  }
}
