import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REQUIRED_CHINESE_HEADINGS = ['本次亮点', '验证', '下载与校验', '说明']
const REQUIRED_ENGLISH_HEADINGS = ['Highlights', 'Verification', 'Download and verification', 'Notice']
const PLACEHOLDER_PATTERN = /\{\{[^}]+\}\}|<(?:VERSION|DATE|HASH|NOTES)>|\b(?:TBD|TODO)\b|待补|待定/iu

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasHeading(section, heading) {
  return new RegExp(`^###\\s+${escapePattern(heading)}\\s*$`, 'mu').test(section)
}

export function collectReleaseNoteErrors(content, version) {
  const notes = String(content || '').replace(/\r\n?/g, '\n')
  const errors = []
  const expectedTitle = `# DeepSeek Harness Desktop ${version}`
  if (!notes.startsWith(`${expectedTitle}\n`)) {
    errors.push(`release title must start with "${expectedTitle}"`)
  }
  if (PLACEHOLDER_PATTERN.test(notes)) errors.push('release notes contain an unresolved placeholder')

  const chineseMatch = notes.match(/^## 中文\s*$([\s\S]*?)(?=^## English\s*$)/mu)
  const englishMatch = notes.match(/^## English\s*$([\s\S]*)$/mu)
  if (!chineseMatch) {
    errors.push('Chinese section "## 中文" is missing or out of order')
  } else {
    const section = chineseMatch[1]
    for (const heading of REQUIRED_CHINESE_HEADINGS) {
      if (!hasHeading(section, heading)) errors.push(`Chinese heading "### ${heading}" is missing`)
    }
    const hanCount = section.match(/\p{Script=Han}/gu)?.length || 0
    if (hanCount < 120) errors.push(`Chinese content is too short (${hanCount} Han characters; need at least 120)`)
  }

  if (!englishMatch) {
    errors.push('English section "## English" is missing or out of order')
  } else {
    const section = englishMatch[1]
    for (const heading of REQUIRED_ENGLISH_HEADINGS) {
      if (!hasHeading(section, heading)) errors.push(`English heading "### ${heading}" is missing`)
    }
    const wordCount = section.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length || 0
    if (wordCount < 120) errors.push(`English content is too short (${wordCount} words; need at least 120)`)
  }

  return errors
}

export function assertBilingualReleaseNotes(content, version) {
  const errors = collectReleaseNoteErrors(content, version)
  if (errors.length) throw new Error(`invalid bilingual release notes:\n- ${errors.join('\n- ')}`)
}

export function releaseNotesFilename(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('invalid release notes version')
  return version.includes('-') ? `release-notes-${version}.md` : 'release-notes.md'
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const packagePath = resolve(process.argv[3] || resolve(repositoryRoot, 'apps', 'dsh-desktop', 'package.json'))
  const manifestText = await readFile(packagePath, 'utf8')
  const candidateVersion = JSON.parse(manifestText).version
  const notesPath = resolve(process.argv[2] || resolve(repositoryRoot, 'docs', 'launch', releaseNotesFilename(candidateVersion)))
  const notes = await readFile(notesPath, 'utf8')
  assertBilingualReleaseNotes(notes, candidateVersion)
  console.log(`validated bilingual release notes for ${candidateVersion}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
