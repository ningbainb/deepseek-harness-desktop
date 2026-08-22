import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { reportInstallerDownloadClick } from '../website/download-telemetry.mjs'

const websiteRoot = resolve(import.meta.dirname, '..', 'website')
const siteScriptPath = resolve(websiteRoot, 'script.js')
const disabledModulePath = resolve(websiteRoot, 'download-telemetry.mjs')

test('public installer links do not load or send click telemetry', async () => {
  const script = await readFile(siteScriptPath, 'utf8')
  const disabledModule = await readFile(disabledModulePath, 'utf8')
  assert.doesNotMatch(script, /download-telemetry\.mjs/u)
  assert.doesNotMatch(script, /reportInstallerDownloadClick/u)
  assert.doesNotMatch(script, /\bsendBeacon\s*\(/u)
  await access(disabledModulePath)
  assert.doesNotMatch(disabledModule, /https?:\/\//u)
  assert.doesNotMatch(disabledModule, /\bsendBeacon\s*\(/u)
  assert.equal(reportInstallerDownloadClick(), false)
})
