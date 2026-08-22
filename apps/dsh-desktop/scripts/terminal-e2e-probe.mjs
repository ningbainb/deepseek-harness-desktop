import { win32 } from 'node:path'

export const CWD_PROBE_SUCCESS = '__DSH_CWD_OK__'
export const CWD_PROBE_MISMATCH = '__DSH_CWD_MISMATCH__'

export function createPowerShellCwdProbe(expectedPath) {
  if (
    typeof expectedPath !== 'string'
    || expectedPath.length === 0
    || expectedPath.length > 4_096
    || expectedPath.includes('\0')
    || !win32.isAbsolute(expectedPath)
  ) {
    throw new TypeError('expected terminal cwd must be an absolute path')
  }
  const encoded = Buffer.from(expectedPath, 'utf8').toString('base64')
  return [
    `$expected=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))`,
    '$actual=[IO.Path]::GetFullPath($PWD.Path)',
    "if($actual -ieq [IO.Path]::GetFullPath($expected)){Write-Output ('__DSH_'+'CWD_OK__')}else{Write-Output ('__DSH_'+'CWD_MISMATCH__'+$actual)}",
  ].join(';')
}
