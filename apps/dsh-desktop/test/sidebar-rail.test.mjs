import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('collapsed footer rail keeps the official footer sizing and centering rules', async () => {
  const source = await readFile(
    resolve(ROOT, 'packages/dsh-web-ui-all/src/client/sidebar-rail.module.css'),
    'utf8',
  )
  const patch = await readFile(
    resolve(ROOT, 'patches/@linxin666__dsh-web-ui-all@0.2.5.patch'),
    'utf8',
  )
  const shim = await readFile(
    resolve(ROOT, 'packages/dsh-web-ui-all/src/client/index.ts'),
    'utf8',
  )

  assert.match(source, /\[class\*='footArea'\] > \[class\*='footerActions'\]/u)
  assert.match(source, /flex-direction:\s*column/u)
  assert.doesNotMatch(source, /footerActions'\]\)\s*\{[^}]*width:\s*36px/u)
  assert.doesNotMatch(source, /footerActions'\]\)\s*\{[^}]*justify-content:\s*flex-start/u)

  assert.match(source, /\[data-sidebar-collapsed\].*\[class\*='footArea'\].*\[class\*='footerActions'/su)
  assert.doesNotMatch(patch, /\[class\*=footerActions\]\}\{[^}]*width:36px/u)
  assert.doesNotMatch(patch, /\[class\*=footerActions\]\}\{[^}]*justify-content:flex-start/u)
  assert.match(shim, /resetExpandedFooterActionStyles/u)
  assert.doesNotMatch(shim, /querySelector\('\[data-rail="rail"\], \[data-wide="rail"\]'\)/u)
  assert.match(patch, /data-slot="sidebar\.footer\.action"/u)
  assert.match(patch, /attributeFilter: \["class", "style", "data-wide", "data-rail"\]/u)
})
