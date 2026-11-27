import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// These packages export ./src/*. A consumer can import a single module without
// loading the plugin entry point and its Cordis or slot type augmentations.
const packages = fileURLToPath(new URL('../packages/', import.meta.url))
const cases = [
  ['dsh-git-graph/tsconfig.client.json', ['src/client/chips/BranchChip.tsx', 'src/css-modules.d.ts']],
  ['dsh-tool-describe-image/tsconfig.host.json', ['src/model-capability.ts']],
]
for (const [config, files] of cases) {
  test(`public source compiles on its own: ${config.split('/')[0]}/${files[0]}`, () => {
    const path = resolve(packages, config)
    const project = ts.readConfigFile(path, ts.sys.readFile)
    assert.equal(project.error, undefined)
    const { options, errors } = ts.parseJsonConfigFileContent(project.config, ts.sys, dirname(path), undefined, path)
    const program = ts.createProgram(files.map(file => resolve(dirname(path), file)), {
      ...options, composite: false, noEmit: true,
    })
    const diagnostics = [...errors, ...ts.getPreEmitDiagnostics(program)]
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: file => file,
      getNewLine: () => '\n',
    }))
  })
}
