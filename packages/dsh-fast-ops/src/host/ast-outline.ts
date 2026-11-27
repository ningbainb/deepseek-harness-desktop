import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DynamicLangRegistrations, Edit } from '@ast-grep/napi'
import { type CodeSelection, readWorkspaceCodeFile, selectCodeFiles } from './code-files.ts'

type BuiltinLanguage = 'TypeScript' | 'Tsx' | 'JavaScript' | 'Html' | 'Css'
type AdditionalLanguage = 'c' | 'cpp' | 'csharp' | 'go' | 'java' | 'json' | 'python' | 'rust'
type Language = BuiltinLanguage | AdditionalLanguage
type Position = { line: number; column: number; index: number }

export interface SyntaxNode {
  kind(): string
  text(): string
  range(): { start: Position; end: Position }
  children(): SyntaxNode[]
  parent(): SyntaxNode | null
  field(name: string): SyntaxNode | null
  findAll(pattern: string | { rule: { kind: string } }): SyntaxNode[]
  getMatch(name: string): SyntaxNode | null
  getMultipleMatches(name: string): SyntaxNode[]
  replace(text: string): Edit
  commitEdits(edits: Edit[]): string
}

interface SyntaxApi {
  parse: (language: Language, source: string) => { root(): SyntaxNode }
  supports(language: Language): boolean
}

const LANGUAGES: Readonly<Record<string, Language>> = {
  '.ts': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript', '.tsx': 'Tsx',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'Tsx',
  '.html': 'Html', '.htm': 'Html', '.css': 'Css',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cxx': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.cs': 'csharp', '.go': 'go', '.java': 'java', '.json': 'json', '.py': 'python', '.rs': 'rust',
}

export function languageFor(path: string): Language | undefined {
  return LANGUAGES[extname(path).toLowerCase()]
}

const BUILTIN_LANGUAGES: ReadonlySet<Language> = new Set(['TypeScript', 'Tsx', 'JavaScript', 'Html', 'Css'])
const GRAMMARS: Readonly<Record<AdditionalLanguage, string>> = {
  c: '@ast-grep/lang-c',
  cpp: '@ast-grep/lang-cpp',
  csharp: '@ast-grep/lang-csharp',
  go: '@ast-grep/lang-go',
  java: '@ast-grep/lang-java',
  json: '@ast-grep/lang-json',
  python: '@ast-grep/lang-python',
  rust: '@ast-grep/lang-rust',
}

let nativeCore: Promise<typeof import('@ast-grep/napi') | undefined> | undefined
let nativeApi: Promise<SyntaxApi | undefined> | undefined

function loadNativeCore() {
  nativeCore ??= import('@ast-grep/napi').catch(() => undefined)
  return nativeCore
}

export async function isNativeAstAvailable(): Promise<boolean> {
  return await loadNativeCore() !== undefined
}

function preflightDynamicRegistration(registrations: DynamicLangRegistrations): Promise<boolean> {
  const entry = pathToFileURL(createRequire(import.meta.url).resolve('@ast-grep/napi')).href
  const script = [
    'const napi = await import(process.argv[1])',
    'napi.registerDynamicLanguage(JSON.parse(process.argv[2]))',
  ].join('\n')
  const env: NodeJS.ProcessEnv = { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }
  // A caller's Node preloads are unrelated to testing whether the bundled grammars can load.
  delete env.NODE_OPTIONS
  return new Promise(resolve => {
    execFile(process.execPath, ['--input-type=module', '-e', script, entry, JSON.stringify(registrations)], {
      cwd: tmpdir(), env, windowsHide: true, timeout: 3000, maxBuffer: 32 * 1024,
    }, error => resolve(error === null))
  })
}

export function loadSyntaxApi(): Promise<SyntaxApi | undefined> {
  nativeApi ??= loadNativeCore().then(async api => {
    if (!api) return undefined
    const results = await Promise.allSettled(Object.entries(GRAMMARS).map(async ([language, pkg]) => {
      const { default: registration } = await import(pkg) as { default: DynamicLangRegistrations[string] }
      // Native dlopen cannot interpret Electron's virtual ASAR file paths.
      const libraryPath = registration.libraryPath.replace(/(^|[\\/])([^\\/]+\.asar)(?=[\\/])/u, '$1$2.unpacked')
      if (!existsSync(libraryPath)) return undefined
      return [language, { ...registration, libraryPath }] as const
    }))
    const registrations: DynamicLangRegistrations = Object.fromEntries(results.flatMap(result =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    ))
    let dynamicEnabled = false
    if (Object.keys(registrations).length > 0 && await preflightDynamicRegistration(registrations).catch(() => false)) {
      try {
        // The upstream binding stores one process-wide registration snapshot.
        api.registerDynamicLanguage(registrations)
        dynamicEnabled = true
      } catch {
        // Built-in grammars remain available after optional registration fails.
      }
    }
    return {
      parse: api.parse as unknown as SyntaxApi['parse'],
      supports: language => BUILTIN_LANGUAGES.has(language) || (dynamicEnabled && Object.hasOwn(registrations, language)),
    }
  })
  return nativeApi
}

export interface OutlineSymbol {
  name: string
  kind: string
  signature: string
  visibility: 'exported' | 'public' | 'private' | 'protected' | 'local'
  startLine: number
  endLine: number
  level: number
}

const DECLARATIONS = new Map([
  ['abstract_class_declaration', 'class'],
  ['class_declaration', 'class'],
  ['interface_declaration', 'interface'],
  ['type_alias_declaration', 'type'],
  ['function_declaration', 'function'],
  ['generator_function_declaration', 'function'],
  ['function_signature', 'function'],
  ['function_definition', 'function'],
  ['function_item', 'function'],
  ['method_declaration', 'method'],
  ['method_definition', 'method'],
  ['method_signature', 'method'],
  ['abstract_method_signature', 'method'],
  ['enum_declaration', 'enum'],
  ['internal_module', 'namespace'],
  ['namespace_definition', 'namespace'],
  ['namespace_declaration', 'namespace'],
  ['struct_item', 'struct'],
  ['struct_specifier', 'struct'],
  ['type_spec', 'type'],
  ['record_declaration', 'record'],
  ['class_specifier', 'class'],
  ['trait_item', 'interface'],
  ['variable_declarator', 'variable'],
  ['const_item', 'variable'],
  ['property_signature', 'property'],
  ['public_field_definition', 'property'],
  ['element', 'element'],
  ['self_closing_tag', 'element'],
  ['rule_set', 'selector'],
  ['pair', 'key'],
])

function compactSignature(text: string): string {
  const concise = text.replace(/\s+/gu, ' ').trim()
  return concise.length <= 240 ? concise : concise.slice(0, 237).replace(/[\uD800-\uDBFF]$/u, '') + '...'
}

function getNativeSymbols(root: SyntaxNode, source: string, max: number): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = []
  function visit(node: SyntaxNode, level: number) {
    if (symbols.length >= max || level > 12) return
    const kind = DECLARATIONS.get(node.kind())
    if (!kind) {
      if (['program', 'document', 'module', 'source_file', 'translation_unit', 'compilation_unit', 'object', 'stylesheet',
        'export_statement', 'lexical_declaration', 'variable_declaration', 'declaration_list',
        'decorated_definition', 'type_declaration', 'const_declaration', 'impl_item'].includes(node.kind())) {
        for (const child of node.children()) visit(child, level)
      }
      return
    }

    const tag = kind === 'element' ? (node.kind() === 'self_closing_tag' ? node
      : node.children().find(child => ['start_tag', 'self_closing_tag'].includes(child.kind()))) : undefined
    let name = node.field('name')
      ?? (kind === 'key' ? node.field('key') : undefined)
      ?? tag?.children().find(child => child.kind() === 'tag_name')
      ?? (kind === 'selector' ? node.children().find(child => child.kind() === 'selectors') : undefined)
    let declarator = node.field('declarator')
    for (let i = 0; !name && declarator && i < 8; i++) {
      if (['identifier', 'field_identifier', 'qualified_identifier'].includes(declarator.kind())) name = declarator
      else declarator = declarator.field('declarator')
    }
    if (!name) return
    const range = node.range()
    const parent = node.parent()
    const declaration = kind === 'variable' && parent ? parent : node
    const exported = declaration.parent()?.kind() === 'export_statement'
    const body = node.field('body') ?? (kind === 'selector' ? node.children().find(child => child.kind() === 'block') : undefined)
    const value = ['variable', 'property', 'type', 'key'].includes(kind) ? node.field('value') : null
    // The pinned N-API wrapper divides byte offsets by two for its UTF-16 representation.
    const endIndex = body?.range().start.index ?? value?.range().start.index ?? range.end.index
    let header = kind === 'key' ? name.text()
      : tag ? `<${name.text()}>` : source.slice(range.start.index, endIndex).replace(/\s*=\s*$/u, '')
    if (value && ['arrow_function', 'function_expression'].includes(value.kind())) {
      const start = value.range().start.index
      const body = value.field('body')
      if (body) header += ` = ${source.slice(start, body.range().start.index).trimEnd()}`
    }
    if (node.kind() === 'variable_declarator') {
      const declarationKind = declaration.children()[0]?.text()
      header = `${declarationKind === 'let' || declarationKind === 'var' ? declarationKind : 'const'} ${header}`
    }
    const visibility = /^\s*(private|protected|public)\s/u.exec(header)?.[1]
    symbols.push({
      name: name.text().slice(0, 120),
      kind,
      signature: compactSignature(exported ? `export ${header}` : header),
      visibility: exported ? 'exported'
        : name.text().startsWith('#') || visibility === 'private' ? 'private'
          : visibility === 'protected' ? 'protected'
            : visibility === 'public' || level > 0 ? 'public' : 'local',
      startLine: range.start.line + 1,
      endLine: range.end.line + 1,
      level,
    })
    if (body && ['class', 'interface', 'namespace', 'struct', 'record'].includes(kind)) {
      for (const child of body.children()) visit(child, level + 1)
    }
    if (kind === 'element' && tag?.kind() === 'start_tag') {
      for (const child of node.children()) visit(child, level + 1)
    }
    if (kind === 'key' && value?.kind() === 'object') {
      for (const child of value.children()) visit(child, level + 1)
    }
  }
  visit(root, 0)
  return symbols
}

function getTextSymbols(text: string, max: number): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = []
  const lines = text.split(/\r?\n/u)
  const declaration = /^(\s*)(?:(export|public|private|protected)\s+)?(?:default\s+)?(?:abstract\s+|async\s+)?(class|interface|enum|struct|record|namespace|type|trait|impl|function|def|func|fn|const|let|var)\s+([$A-Za-z_][\w$]*)/u
  for (let line = 0; line < lines.length && symbols.length < max; line++) {
    const match = declaration.exec(lines[line])
    if (!match) continue
    const [, indent, modifier, kind, name] = match
    let signature = lines[line].split('{', 1)[0]
    if (['const', 'let', 'var'].includes(kind)) signature = signature.split('=', 1)[0]
    symbols.push({
      name,
      kind,
      signature: compactSignature(signature),
      visibility: modifier === 'export' ? 'exported' : modifier === 'public' || modifier === 'private' || modifier === 'protected' ? modifier : 'local',
      startLine: line + 1,
      endLine: line + 1,
      level: Math.min(12, Math.floor(indent.replaceAll('\t', '  ').length / 2)),
    })
  }
  return symbols
}

export function outlineSource(path: string, text: string, api: SyntaxApi | undefined, max: number) {
  const language = languageFor(path)
  if (api && language && api.supports(language)) {
    try {
      return { parser: 'ast' as const, symbols: getNativeSymbols(api.parse(language, text).root(), text, max) }
    } catch {
      // The same file can still be inspected with the text outline.
    }
  }
  return { parser: 'fallback' as const, symbols: getTextSymbols(text, max) }
}

export async function outlineWorkspace(
  root: string,
  params: CodeSelection & { maxSymbols?: number },
  signal?: AbortSignal,
) {
  const { paths, bounded, error } = await selectCodeFiles(root, params, 40, signal)
  if (error) return { ok: false, error }
  const api = await loadSyntaxApi()
  const limit = Math.max(1, Math.min(200, params.maxSymbols ?? 120))
  let remaining = limit
  const files = []
  for (const path of paths) {
    signal?.throwIfAborted()
    const file = await readWorkspaceCodeFile(root, path)
    if (!file) continue
    const outline = outlineSource(path, file.text, api, remaining)
    files.push({ path, revision: file.revision, ...outline })
    remaining -= outline.symbols.length
    if (remaining <= 0) break
  }
  return { ok: true, files, bounded: bounded || remaining <= 0 }
}
