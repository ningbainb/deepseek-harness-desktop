import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('generated aggregate activates its own compatibility plugin before child plugins', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('./aggregate.mjs', import.meta.url)), '--check'], { stdio: 'pipe' })
  const patch = readFileSync(new URL('../packages/dsh-web-ui-all/cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /# from self\r?\n- insert:\r?\n    - id: ui-web-ui-compat\r?\n      name: '@linxin666\/dsh-web-ui-all'/u)
  assert.equal((patch.match(/id: ui-web-ui-compat/gu) ?? []).length, 1)
  assert.ok(patch.indexOf('id: ui-web-ui-compat') < patch.indexOf('id: ui-web-ui-settings'))
})
