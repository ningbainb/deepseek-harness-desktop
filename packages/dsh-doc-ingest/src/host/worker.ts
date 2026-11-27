import { Worker } from 'node:worker_threads'
import { MAX_PARSE_MS, type DocumentResult, type ParseRequest, type ParseResponse } from '../core/types.ts'

export async function runParseWorker(
  request: ParseRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DocumentResult> {
  options.signal?.throwIfAborted()
  const workerUrl = new URL(import.meta.url.endsWith('.ts') ? './parse-worker.ts' : './parse-worker.js', import.meta.url)
  const worker = new Worker(workerUrl, {
    workerData: request,
    transferList: request.kind === 'document' ? [request.bytes.buffer] : [],
    execArgv: [],
    stdout: true,
    stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 24, stackSizeMb: 4 },
  })
  // Several parsers emit raw input on conversion failures. Their diagnostic
  // streams are drained here; only the bounded result crosses the worker.
  worker.stdout.resume()
  worker.stderr.resume()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(options.signal?.reason ?? new Error('Document parse cancelled.'))
      worker.once('error', reject)
      worker.once('exit', code => reject(new Error(`Document parser stopped before returning a result (${code}).`)))
      worker.once('message', (response: ParseResponse) => {
        if (response.ok) resolve(response.result)
        else reject(new Error(response.message))
      })
      timer = setTimeout(() => reject(new Error('Document parse exceeded its time limit.')), options.timeoutMs ?? MAX_PARSE_MS)
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) abort()
    })
  } finally {
    clearTimeout(timer)
    if (abort) options.signal?.removeEventListener('abort', abort)
    await worker.terminate()
  }
}
