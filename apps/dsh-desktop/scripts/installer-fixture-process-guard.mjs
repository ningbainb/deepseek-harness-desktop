import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export function productProcessIdsFromTasklist(output) {
  return [...output.matchAll(/^"DeepSeek Harness Desktop\.exe",\s*"(\d+)"/gimu)].map(match => Number(match[1]))
}

export async function assertInstallerFixtureProcessIsolation() {
  const { stdout } = await promisify(execFile)('tasklist.exe', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq DeepSeek Harness Desktop.exe'], { windowsHide: true })
  const pids = productProcessIdsFromTasklist(stdout)
  if (pids.length) throw new Error(`Isolated installer fixtures must run without any Desktop instance. Refusing to invoke product-wide preflight cleanup; existing PIDs: ${pids.join(', ')}`)
}
