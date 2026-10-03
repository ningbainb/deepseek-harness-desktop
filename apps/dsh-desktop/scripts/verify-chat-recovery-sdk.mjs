import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const workspaceRequire = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))
const typescript = workspaceRequire('typescript')
const packageRoot = dirname(desktopRequire.resolve('@linxin666/dsh-chat-recovery/package.json'))
const rootFiles = ['src', 'lib/types'].flatMap(directory => readdirSync(join(packageRoot, directory), { recursive: true })
  .filter(filename => /\.(ts|tsx)$/u.test(filename))
  .map(filename => join(packageRoot, directory, filename)))
const program = typescript.createProgram(rootFiles, {
  target: typescript.ScriptTarget.ES2022,
  module: typescript.ModuleKind.ESNext,
  moduleResolution: typescript.ModuleResolutionKind.Bundler,
  jsx: typescript.JsxEmit.ReactJSX,
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  allowImportingTsExtensions: true,
  esModuleInterop: true,
  types: [],
  typeRoots: [dirname(dirname(workspaceRequire.resolve('@types/react/package.json')))],
})
const diagnostics = [
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
  ...rootFiles.flatMap(filename => {
    const source = program.getSourceFile(filename)
    if (!source) throw new Error(`TypeScript did not load ${filename}`)
    return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
  }),
]
if (diagnostics.length) {
  console.error(typescript.formatDiagnostics(diagnostics, {
    getCanonicalFileName: filename => filename,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }))
}
console.log(`Chat recovery SDK-backed source/declarations: files=${rootFiles.length} diagnostics=${diagnostics.length}`)
process.exitCode = diagnostics.length ? 1 : 0
