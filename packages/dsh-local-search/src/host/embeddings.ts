import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SearchDocument } from '../core/search.ts'
import { digest } from './index-store.ts'

export type EmbeddingConfig =
  | { mode: 'off' }
  | { mode: 'api'; baseUrl: string; model: string; apiKeyEnv?: string }
  | { mode: 'local-onnx'; modelPath: string }

interface PipelineOutput {
  tolist(): number[][]
}

type Pipeline = (input: string[], options: { pooling: 'mean'; normalize: boolean }) => Promise<PipelineOutput>

export class Embeddings {
  private pipeline?: Promise<Pipeline>
  private readonly api?: URL
  readonly revision: string

  constructor(private readonly home: string, private readonly config: EmbeddingConfig = { mode: 'off' }) {
    if (config.mode === 'api') {
      const base = new URL(config.baseUrl.replace(/\/?$/u, '/'))
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
        || base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
        throw new Error('Invalid embedding endpoint')
      }
      this.api = new URL('embeddings', base)
    }
    if (config.mode === 'local-onnx' && !isAbsolute(config.modelPath)) throw new Error('Invalid local embedding model directory')
    this.revision = digest(JSON.stringify(config))
  }

  get enabled(): boolean { return this.config.mode !== 'off' }

  private async embed(text: readonly string[]): Promise<number[][]> {
    const input = text.map(value => value.slice(0, 6000))
    if (this.config.mode === 'off' || input.length === 0) return []
    if (this.config.mode === 'local-onnx') {
      const model = this.config.modelPath
      this.pipeline ??= (async () => {
        // The model and its engine are provisioned locally by the user.
        const hostRequire = createRequire(join(this.home, 'profiles', 'desktop', 'package.json'))
        const enginePath = hostRequire.resolve('@huggingface/transformers')
        const engine = await import(pathToFileURL(enginePath).href) as {
          pipeline(task: string, model: string, config: object): Promise<Pipeline>
        }
        return engine.pipeline('feature-extraction', model, { local_files_only: true, dtype: 'q8', device: 'cpu' })
      })()
      return (await (await this.pipeline)(input, { pooling: 'mean', normalize: true })).tolist()
    }
    const envName = this.config.apiKeyEnv
    if (envName !== undefined && !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/u.test(envName)) throw new Error('Invalid embedding credential reference')
    const apiKey = envName === undefined ? undefined : process.env[envName]
    if (envName !== undefined && !apiKey) throw new Error('Embedding credential is unavailable')
    const response = await fetch(this.api!, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {}) },
      body: JSON.stringify({ model: this.config.model, input }),
    })
    if (!response.ok || !response.body) throw new Error('Embedding request unavailable')
    const reader = response.body.getReader()
    let bytes = 0
    const chunks: Uint8Array[] = []
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 2 * 1024 * 1024) throw new Error('Embedding response exceeded its byte budget')
        chunks.push(chunk.value)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8')).data as unknown
    if (!Array.isArray(data) || data.length !== input.length) throw new Error('Invalid embedding response')
    const output: number[][] = []
    for (const entry of data) {
      if (!entry || !Number.isSafeInteger(entry.index) || entry.index < 0 || entry.index >= input.length || output[entry.index]
        || !Array.isArray(entry.embedding) || entry.embedding.length > 4096 || !entry.embedding.every(Number.isFinite)) {
        throw new Error('Invalid embedding response')
      }
      output[entry.index] = entry.embedding
    }
    return output
  }

  async query(text: string): Promise<number[] | undefined> {
    if (this.config.mode === 'off' || !text.trim()) return undefined
    try { return (await this.embed([text]))[0] } catch { return undefined }
  }

  async documents(docs: SearchDocument[], stillAllowed: (batch: readonly SearchDocument[]) => boolean): Promise<SearchDocument[]> {
    if (this.config.mode === 'off') return docs
    const output: SearchDocument[] = []
    // Keep semantic enrichment bounded and retain lexical coverage for every document.
    const capped = Math.min(512, docs.length)
    for (let start = 0; start < capped; start += 12) {
      const batch = docs.slice(start, Math.min(capped, start + 12))
      if (!stillAllowed(batch)) return [...output, ...docs.slice(start)]
      try {
        const vectors = await this.embed(batch.map(row => row.title + '\n' + row.text))
        output.push(...batch.map((row, index) => ({ ...row, vector: vectors[index] })))
      } catch {
        return [...output, ...docs.slice(start)]
      }
    }
    return [...output, ...docs.slice(capped)]
  }
}
