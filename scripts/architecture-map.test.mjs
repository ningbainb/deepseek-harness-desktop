import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  execFileSync('git', ['add', '.'], { cwd })
  const script = fileURLToPath(new URL('./architecture-map.mjs', import.meta.url))
  const options = { cwd, input: JSON.stringify([{ path: cwd }]), encoding: 'utf8' }
  const report = JSON.parse(execFileSync(process.execPath, [script], options))
  assert.deepEqual(report.localImports, [
    { file: 'a.ts', target: 'b.ts', kind: 'static' },
    { file: 'b.ts', target: 'a.ts', kind: 'type' },
  ])
  execFileSync(process.execPath, [script, '--check'], options)
  writeFileSync(join(cwd, 'b.ts'), "export { a as b } from './a.ts'\n")
  const cycle = spawnSync(process.execPath, [script, '--check'], options)
  assert.equal(cycle.status, 1)
  assert.match(cycle.stderr, /a\.ts -> b\.ts -> a\.ts/)
})
