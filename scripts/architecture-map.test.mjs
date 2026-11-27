import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('architecture check distinguishes a type reference from a circular value import', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-module-graph-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'package.json'), '{"name":"example"}')
  writeFileSync(join(cwd, 'a.ts'), "import { b } from './b.ts'\nexport const a = b\n")
  writeFileSync(join(cwd, 'b.ts'), "import type { a } from './a.ts'\nexport const b = 1\n")
  execFileSync('git', ['init', '--quiet'], { cwd })
  writeFileSync(join(cwd, 'removed.ts'), 'export {}')
  execFileSync('git', ['add', 'a.ts', 'removed.ts'], { cwd })
  unlinkSync(join(cwd, 'removed.ts'))
  const script = fileURLToPath(new URL('./architecture-map.mjs', import.meta.url))
  const options = { cwd, input: JSON.stringify([{ path: cwd }]), encoding: 'utf8' }
  const report = JSON.parse(execFileSync(process.execPath, [script], options))
  assert.deepEqual(report.files, ['a.ts', 'b.ts'])
  assert.deepEqual(report.localImports, [
    { file: 'a.ts', target: 'b.ts', kind: 'static' },
    { file: 'b.ts', target: 'a.ts', kind: 'type' },
  ])
  execFileSync(process.execPath, [script, '--check'], options)
  writeFileSync(join(cwd, 'b.ts'), "export { a as b } from './a.ts'\n")
  const cycle = spawnSync(process.execPath, [script, '--check'], options)
  assert.equal(cycle.status, 1)
  assert.match(cycle.stderr, /a\.ts -> b\.ts -> a\.ts/)

  // The same two modules under a plugin's source boundary must have a one-way
  // contract, even when the reverse dependency is erased by the compiler.
  unlinkSync(join(cwd, 'a.ts'))
  unlinkSync(join(cwd, 'b.ts'))
  const src = join(cwd, 'packages/example/src')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'view.ts'), "import { load } from './catalog.ts'\nexport interface Row {}\nexport { load }\n")
  writeFileSync(join(src, 'catalog.ts'), "import type { Row } from './view.ts'\nexport const load = (): Row => ({})\n")
  const reversed = spawnSync(process.execPath, [script, '--check'], options)
  assert.equal(reversed.status, 1)
  assert.match(reversed.stderr, /catalog\.ts -> packages\/example\/src\/view\.ts -> packages\/example\/src\/catalog\.ts/)
  writeFileSync(join(src, 'catalog.ts'), 'export interface Row {}\nexport const load = (): Row => ({})\n')
  execFileSync(process.execPath, [script, '--check'], options)
})
