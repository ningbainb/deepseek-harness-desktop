import assert from 'node:assert/strict'
import test from 'node:test'

import { collectReleaseNoteErrors, releaseNotesFilename } from './validate-release-notes.mjs'

const chineseBody = '本次更新继续完善桌面体验、更新流程、界面信息和安全提示，并完成真实安装包、窗口与目录选择器验证。'.repeat(3)
const englishBody = 'This release continues to refine the desktop experience, update flow, interface information, and safety guidance with packaged application verification. '.repeat(5)

function bilingualNotes(version = '0.1.3') {
  return `# DeepSeek Harness Desktop ${version}

## 中文

### 本次亮点

${chineseBody}

### 验证

${chineseBody}

### 下载与校验

${chineseBody}

### 说明

${chineseBody}

## English

### Highlights

${englishBody}

### Verification

${englishBody}

### Download and verification

${englishBody}

### Notice

${englishBody}
`
}

test('accepts a complete bilingual release body for the package version', () => {
  assert.deepEqual(collectReleaseNoteErrors(bilingualNotes(), '0.1.3'), [])
})

test('candidate release notes do not overwrite the public stable release', () => {
  assert.equal(releaseNotesFilename('5.0.0'), 'release-notes.md')
  assert.equal(releaseNotesFilename('5.0.1-beta.1'), 'release-notes-5.0.1-beta.1.md')
  assert.throws(() => releaseNotesFilename('../other-file'))
})

test('accepts release notes for an exact prerelease package version', () => {
  assert.deepEqual(collectReleaseNoteErrors(bilingualNotes('4.0.0-rc.3'), '4.0.0-rc.3'), [])
})

test('rejects stale versions and placeholder tokens', () => {
  const errors = collectReleaseNoteErrors(`${bilingualNotes('0.1.2')}\nTBD`, '0.1.3')
  assert.ok(errors.some((error) => error.includes('0.1.3')))
  assert.ok(errors.some((error) => error.includes('placeholder')))
})

test('rejects missing Chinese or English sections', () => {
  const noChinese = bilingualNotes().replace(/## 中文[\s\S]*?(?=## English)/, '')
  const noEnglish = bilingualNotes().replace(/## English[\s\S]*$/, '')
  assert.ok(collectReleaseNoteErrors(noChinese, '0.1.3').some((error) => error.includes('Chinese')))
  assert.ok(collectReleaseNoteErrors(noEnglish, '0.1.3').some((error) => error.includes('English')))
})

test('rejects shallow translations even when headings exist', () => {
  const shallow = bilingualNotes()
    .replace(new RegExp(chineseBody.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '太短。')
    .replace(new RegExp(englishBody.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'Too short.')
  const errors = collectReleaseNoteErrors(shallow, '0.1.3')
  assert.ok(errors.some((error) => error.includes('Chinese content')))
  assert.ok(errors.some((error) => error.includes('English content')))
})
