import { stripVTControlCharacters } from 'node:util'
import type { FastOpsSettings } from '../core/settings.ts'

const MIN_DENOISE_CHARS = 2500

type Rule = 'git' | 'test' | 'build'

/** Classify recognizable command invocations, never interpreting the output as a command. */
function ruleFor(command: string): { rule: Rule; gitOperation?: string } | undefined {
  if (/[;&|\r\n]/u.test(command)) return undefined
  const text = command.trim().replace(/^(?:(?:pnpm|npm|npx|yarn|bun)(?:\.cmd)?\s+(?:run\s+|exec\s+(?:--\s+)?|dlx\s+)?)/iu, '')
  const gitOperation = /^git(?:\.exe)?\s+(status|diff|log)(?:\s|$)/iu.exec(text)?.[1].toLowerCase()
  if (gitOperation) return { rule: 'git', gitOperation }
  if (/^(?:test(?:\s|$)|(?:vitest|jest|pytest)(?:\s|$)|node(?:\.exe)?\s+--test(?:\s|$)|cargo\s+test(?:\s|$))/iu.test(text)) return { rule: 'test' }
  if (/^(?:(?:tsc|eslint|build)(?:\s|$)|cargo\s+(?:build|check)(?:\s|$))/iu.test(text)) return { rule: 'build' }
  return undefined
}

/** Produce a shorter projection only. The caller must retain original output before using it. */
export function denoiseCommandOutput(raw: string, command: string, settings: FastOpsSettings['denoise']): string | undefined {
  if (!settings.enabled || raw.length <= MIN_DENOISE_CHARS) return undefined
  const { rule, gitOperation } = ruleFor(command) ?? {}
  if (rule && !settings[rule]) return undefined

  const lines = stripVTControlCharacters(raw)
    .split(/\r?\n/u)
    .map(line => line.replace(/\r+$/u, '').split('\r').at(-1) ?? '')
  const out: string[] = []
  let passing = 0
  let duplicateDiagnostics = 0
  let hiddenGitChanges = 0
  let hunkLines = 0
  let shortCommits = 0
  let insideHunk = false
  let stderr = false
  const seenDiagnostics = new Set<string>()
  const statusCounts = new Map<string, number>()
  const omittedStatuses = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\[stderr\]\s*$/iu.test(line)) stderr = true
    if (!stderr && rule === 'test' && /^(?:ok \d+ - |(?:PASS|PASSED)\s+\S|\s*[\u2713\u221a]\s+\S|.+::\w+\s+PASSED(?:\s+\[.*\])?$)/u.test(line)) {
      passing++
      continue
    }
    if (!stderr && rule === 'build' && /^(?:.+\(\d+,\d+\):\s+(?:error|warning)\s+[A-Z]+\d+|.+:\d+:\d+:\s+(?:error|warning)|(?:error|warning)\[[A-Z]\d+\]:)/u.test(line)) {
      if (seenDiagnostics.has(line)) {
        duplicateDiagnostics++
        continue
      }
      seenDiagnostics.add(line)
    }
    if (!stderr && rule === 'git') {
      if (gitOperation === 'status') {
        const kind = /^([ MADRCUT?!]{2})\s+\S/u.exec(line)?.[1].trim()
          || /^\t(modified|new file|deleted|renamed|copied|typechange):/u.exec(line)?.[1]
        if (kind) {
          const count = (statusCounts.get(kind) ?? 0) + 1
          statusCounts.set(kind, count)
          if (count > 12) {
            omittedStatuses.set(kind, count - 12)
            continue
          }
        }
      }
      if (gitOperation === 'log' && /^[a-f0-9]{7,40} \S/u.test(line) && ++shortCommits > 30) continue
      if (/^(?:diff --git|commit )/u.test(line)) insideHunk = false
      if (/^@@ /u.test(line)) {
        insideHunk = true
        hunkLines = 0
      } else if (insideHunk && /^[ +\-]/u.test(line) && ++hunkLines > 4) {
        hiddenGitChanges++
        continue
      }
    }
    if (line.trim() === '' && out.at(-1)?.trim() === '') continue
    if (!stderr && /^(?:warn(?:ing)?\b|npm warn\b)/iu.test(line)) {
      let repetitions = 1
      while (lines[i + repetitions] === line) repetitions++
      if (repetitions > 1) {
        out.push(`${line} [repeated ${repetitions} times]`)
        i += repetitions - 1
        continue
      }
    }
    out.push(line)
  }
  if (passing) out.push(`[${passing} successful test records omitted]`)
  if (duplicateDiagnostics) out.push(`[${duplicateDiagnostics} duplicate build diagnostics omitted]`)
  if (hiddenGitChanges) out.push(`[${hiddenGitChanges} Git hunk lines omitted]`)
  if (shortCommits > 30) out.push(`[${shortCommits - 30} earlier Git commits omitted]`)
  for (const [kind, omitted] of omittedStatuses) out.push(`[${omitted} more Git status entries of type ${kind}]`)
  const text = out.join('\n').trimEnd()
  return raw.length - text.length >= 220 ? text : undefined
}
