import { execFileSync } from 'node:child_process'
import { json } from 'node:stream/consumers'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import ts from 'typescript'

// pnpm reports the active workspace, including projects with no dependencies.
const projects = await json(process.stdin)
if (!Array.isArray(projects) || !projects.length) throw new Error('Expected pnpm workspace list on stdin')
const workspaces = projects.map(({ path }) => ({
  directory: relative(process.cwd(), path).split(sep).join('/') || '.',
  manifest: JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8')),
}))
const sourceEntries = new Set(workspaces.flatMap(({ directory, manifest }) => {
  if (manifest.scripts?.build || typeof manifest.main !== 'string') return []
  return [relative(process.cwd(), resolve(directory, manifest.main)).split(sep).join('/')]
}))

// Include local packages before their first commit. Ignore generated and deleted files.
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--deduplicate'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  .split('\0')
  .filter(file => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file))
  .filter(file => sourceEntries.has(file) || !/(^|\/)(?:vendor|dist|lib|node_modules|fixtures)\//.test(file))
  .filter(file => existsSync(file))
  .sort()
const sourceFiles = new Set(files)
const localImports = []
const bodies = new Map()
const options = { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler }
const moduleCache = ts.createModuleResolutionCache(process.cwd(), ts.sys.useCaseSensitiveFileNames ? s => s : s => s.toLowerCase(), options)

function namedTypes(bindings) {
  return bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly)
}

for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  function record(specifier, kind) {
    if (!specifier || !ts.isStringLiteralLike(specifier) || !specifier.text.startsWith('.')) return
    const result = ts.resolveModuleName(specifier.text, resolve(file), options, ts.sys, moduleCache)
    if (!result.resolvedModule) return
    const target = relative(process.cwd(), result.resolvedModule.resolvedFileName).split(sep).join('/')
    if (sourceFiles.has(target)) localImports.push({ file, target, kind })
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const types = clause?.isTypeOnly || (!clause?.name && namedTypes(clause?.namedBindings))
      record(node.moduleSpecifier, types ? 'type' : 'static')
    } else if (ts.isExportDeclaration(node)) {
      const names = node.exportClause
      const types = node.isTypeOnly || (names && ts.isNamedExports(names) && names.elements.length && names.elements.every(item => item.isTypeOnly))
      record(node.moduleSpecifier, types ? 'type' : 'static')
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      record(node.argument.literal, 'type')
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(node.moduleReference.expression, node.isTypeOnly ? 'type' : 'require')
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) record(node.arguments[0], 'dynamic')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') record(node.arguments[0], 'require')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue
    const body = statement.body.getText(source).replaceAll('\r\n', '\n')
    if (body.length < 120) continue
    const name = statement.name.text
    const key = name + '\n' + body
    if (!bodies.has(key)) bodies.set(key, { name, files: [] })
    bodies.get(key).files.push(file)
  }
}

const names = new Set(workspaces.map(({ manifest }) => manifest.name))
const packages = workspaces.map(({ directory, manifest }) => {
  const dependencies = []
  for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, specifier] of Object.entries(manifest[kind] ?? {})) {
      if (names.has(name)) dependencies.push({ name, kind, specifier })
    }
  }
  return { directory, name: manifest.name, dependencies }
})

const duplicateFunctions = [...bodies.values()].filter(group => group.files.length > 1)
if (process.argv.includes('--check')) {
  // Plugin source contracts also obey the direction of module dependencies.
  // Dynamic imports and require remain visible in the report as separate edge kinds.
  const pluginSource = /^packages\/(?:skins\/)?[^/]+\/src\//u
  const imports = new Map(files.map(file => [file, []]))
  for (const { file, target, kind } of localImports) {
    if (kind === 'static' || (kind === 'type' && pluginSource.test(file) && pluginSource.test(target))) {
      imports.get(file).push(target)
    }
  }
  const finished = new Set()
  const active = new Set()
  function check(file) {
    if (finished.has(file)) return
    if (active.has(file)) {
      const cycle = [...active].slice([...active].indexOf(file)).concat(file)
      throw new Error('Source dependency cycle: ' + cycle.join(' -> '))
    }
    active.add(file)
    for (const dependency of imports.get(file)) check(dependency)
    active.delete(file)
    finished.add(file)
  }
  for (const file of files) check(file)
  console.log(`Checked relative static imports and plugin type dependencies across ${files.length} source files.`)
} else {
  process.stdout.write(JSON.stringify({ packages, files, localImports, duplicateFunctions }, null, 2) + '\n')
}
