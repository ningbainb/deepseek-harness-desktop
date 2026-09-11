import { open, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { analyzeUpdateLog } from '../src/update-log-analysis.mjs'

const [input, output, ...extra] = process.argv.slice(2)
if (!input || extra.length) throw new Error('Usage: node scripts/diagnose-update-log.mjs <runtime.log> [new-report.json]')
const handle = await open(resolve(input), 'r')
let text
try {
  const { size } = await handle.stat()
  if (size > 16 * 1024 * 1024) throw new Error('Log exceeds 16 MiB; use a single rotated log file')
  text = await handle.readFile('utf8')
} finally { await handle.close() }
const result = JSON.stringify(analyzeUpdateLog(text), null, 2) + '\n'
if (output) await writeFile(resolve(output), result, { encoding: 'utf8', flag: 'wx' })
else process.stdout.write(result)
