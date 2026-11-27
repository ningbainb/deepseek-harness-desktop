import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  ['dsh-value-mode/tsconfig.host.json', ['src/preset-registry.ts', 'src/preset-schema.ts', 'src/sync.ts']],
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

test('preset consumers receive the SDK contracts needed by their published imports', () => {
  const consumers = [
    ['dsh-liangshen', ['@deepseek-ai/cordis']],
    ['dsh-value-mode', ['@deepseek-ai/cordis', '@deepseek-ai/dsh-agent-preset-registry', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']],
  ]
  for (const [pkg, requirements] of consumers) {
    const manifest = JSON.parse(readFileSync(resolve(packages, pkg, 'package.json'), 'utf8'))
    for (const dependency of requirements) {
      assert.ok(manifest.dependencies?.[dependency] || manifest.peerDependencies?.[dependency],
        `${pkg} must declare ${dependency} for its published Host or source entry`)
    }
  }

  const config = resolve(packages, 'dsh-liangshen', 'tsconfig.build.json')
  const project = ts.getParsedCommandLineOfConfigFile(config, {}, ts.sys)
  assert.ok(project.fileNames.map(file => resolve(file)).includes(resolve(dirname(config), 'src/schema.ts')),
    'LiangShen must emit the existing lib/types/schema.d.ts entry')
})
