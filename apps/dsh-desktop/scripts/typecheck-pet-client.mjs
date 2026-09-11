import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(appDir, '../../packages/dsh-pet')
const localRequire = createRequire(resolve(workspace, 'package.json'))
const appRequire = createRequire(resolve(appDir, 'package.json'))

/** Check the published client against local official NPM SDK declarations. */
export function typecheckPetClient(target) {
  const ts = localRequire('typescript')
  const options = {
    target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
    strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true,
    types: ['node'], typeRoots: [resolve(workspace, 'node_modules/@types')],
    lib: ['lib.es2024.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  }
  const host = ts.createCompilerHost(options)
  host.resolveModuleNames = (names, file) => names.map(name => {
    // Never substitute older workspace source for a missing relative file.
    const bases = name.startsWith('.') || isAbsolute(name) ? [file]
      : [file, resolve(appDir, 'verify.ts'), resolve(workspace, 'verify.ts')]
    for (const base of bases) {
      const found = ts.resolveModuleName(name, base, options, ts.sys).resolvedModule
      if (found) return found
    }
    return undefined
  })
  const program = ts.createProgram([resolve(target, 'src/client/index.ts'), resolve(target, 'src/client/css-modules.d.ts')], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
  console.log('Multi-pet client typecheck passed against local official NPM SDK packages')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  typecheckPetClient(process.argv[2] ? resolve(process.argv[2]) : dirname(appRequire.resolve('@linxin666/dsh-pet/package.json')))
}
