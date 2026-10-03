import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)

test('Desktop sidebar expands the bottom panel without implicitly opening a terminal', async () => {
  const packageRoot = dirname(require.resolve('dsh-better-sidebar/package.json'))
  const client = await readFile(join(packageRoot, 'lib', 'client.js'), 'utf8')
  const state = await readFile(join(packageRoot, 'src', 'client', 'state.ts'), 'utf8')
  const sidebar = await readFile(join(packageRoot, 'src', 'client', 'Sidebar.tsx'), 'utf8')
  assert.match(state, /function toggleBottomPanel\(state: SidebarState\): SidebarState \{\s*return \{ \.\.\.state, bottomOpen: !state\.bottomOpen \}\s*\}/u)
  assert.match(sidebar, /data-dsh-bottom-toggle[\s\S]*?onClick=\{\(\) => \{ store\.reduce\(toggleBottomPanel\) \}\}/u)
  assert.doesNotMatch(sidebar, /terminal-open|toolAction\(/u)
  assert.doesNotMatch(client, /bottomPanelAutoTerminal/u)
})
