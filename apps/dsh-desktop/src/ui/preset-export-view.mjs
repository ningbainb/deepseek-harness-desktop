/** Localize export failures without discarding the original diagnostic details. */
export function presetExportFailureMessage(error) {
  const message = String(error?.message ?? error)
  if (/lockfile is required|lockfile integrity is unavailable/u.test(message)) {
    return '社区插件缺少可验证的版本锁定信息，暂时无法导出。请检查社区插件的安装状态；导出不会自动安装插件或跳过它们。'
  }
  if (/lockfile is invalid/u.test(message)) return '社区插件的版本锁定文件格式异常，暂时无法导出。请保留原文件并联系维护者检查。'
  if (/installed version is unavailable|failed to inspect installed package manifest/u.test(message)) {
    return '无法读取社区插件的已安装版本。请检查插件是否安装完整后重试。'
  }
  if (/\b(?:EACCES|EPERM|EBUSY)\b/u.test(message)) return '无法写入保存位置，可能没有权限或文件正被占用。请关闭占用文件的程序，或换一个目录后重试。'
  if (/\bENOSPC\b/u.test(message)) return '保存位置的磁盘空间不足，请释放空间或换一个磁盘后重试。'
  if (/\b(?:ENOENT|ENOTDIR|EISDIR|EEXIST)\b/u.test(message)) return '保存路径不可用，请重新选择文件名和保存目录后重试。'
  if (/settings YAML is invalid|state file is invalid|not valid YAML/u.test(message)) return '本地设置或模板文件格式异常，请修正格式后重试。'
  if (/exceed|size limit|file count|compression ratio/u.test(message)) return '导出内容超过 Preset 的安全大小或文件数量限制，请整理技能文件后重试。'
  if (/credential|sensitive|secret|non-portable|absolute path/iu.test(message)) return '导出内容包含敏感信息或本机路径，已停止导出。请检查技能和任务模板后重试。'
  if (/skill|symbolic link|special file/u.test(message)) return '技能文件不符合 Preset 的安全导出规则。请检查技术详情；脚本、链接及不支持的文件不会被静默跳过。'
  return 'Preset 导出失败，请重试；如果仍然失败，请将下方技术详情反馈给维护者。'
}
