import assert from 'node:assert/strict'
import test from 'node:test'
import { presetExportFailureMessage } from '../src/ui/preset-export-view.mjs'

test('export errors survive Electron wrapping and have actionable Chinese explanations', () => {
  for (const [reason, expected] of [
    ['desktop profile lockfile is required for preset export', '版本锁定信息'],
    ['lockfile integrity is unavailable for @community/example@1.0.0', '不会自动安装'],
    ['desktop profile lockfile is invalid', '保留原文件'],
    ['installed version is unavailable for @community/example', '安装完整'],
    ['EACCES: permission denied', '没有权限'],
    ['EPERM: operation not permitted', '没有权限'],
    ['EBUSY: resource busy', '文件正被占用'],
    ['ENOSPC: no space left', '磁盘空间不足'],
    ['ENOTDIR: not a directory', '保存路径不可用'],
    ['EEXIST: file already exists, mkdir', '保存路径不可用'],
    ['preset settings YAML is invalid', '格式异常'],
    ['preset skills exceed the export limit', '数量限制'],
    ['preset skills cannot contain executable scripts', '安全导出规则'],
    ['preset skills cannot contain hidden credential files', '敏感信息'],
    ['unexpected failure', '技术详情'],
  ]) {
    const error = new Error(`Error invoking remote method 'extensions:preset-export': Error: ${reason}`)
    assert.ok(presetExportFailureMessage(error).includes(expected), reason)
  }
  assert.match(presetExportFailureMessage(null), /导出失败/u)
})
