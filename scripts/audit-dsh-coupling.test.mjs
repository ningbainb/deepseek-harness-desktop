import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalText, createCouplingAudit, renderCouplingAuditMarkdown } from './audit-dsh-coupling.mjs'

test('coupling evidence is stable across Windows line endings', () => {
  const lf = 'inject = [slots, locale]\nregisterHostService(remote)\n'
  const crlf = lf.replaceAll('\n', '\r\n')
  assert.equal(canonicalText(crlf), lf)
})

test('DSH coupling audit classifies every import and required seam category', async () => {
  const [audit, concurrentAudit] = await Promise.all([
    createCouplingAudit(),
    createCouplingAudit(),
  ])
  assert.equal(audit.schemaVersion, 1)
  assert.match(audit.upstreamVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u)
  assert.match(audit.lockfileSha256, /^[a-f0-9]{64}$/u)
  assert.equal(audit.imports.length > 0, true)
  assert.equal(audit.imports.every((item) => [
    'public-stable',
    'public-experimental',
    'compatibility-patch',
    'private-high-risk',
  ].includes(item.classification)), true)
  for (const category of ['slot', 'host-service', 'runtime-lifecycle', 'profile-home', 'workspace', 'session']) {
    assert.equal(audit.seams.some((item) => item.category === category), true, `missing ${category} evidence`)
  }
  assert.deepEqual(concurrentAudit.seams, audit.seams)
  const markdown = renderCouplingAuditMarkdown(audit)
  assert.match(markdown, /Capability discovery is compatibility evidence only/u)
  assert.match(markdown, /Direct imports, dynamic imports, and requires/u)
})
