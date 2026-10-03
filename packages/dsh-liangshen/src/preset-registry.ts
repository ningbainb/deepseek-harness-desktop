import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { parse } from 'yaml'

function readObject(path: string): Record<string, unknown> {
  const value: unknown = parse(readFileSync(path, 'utf8'), { uniqueKeys: true })
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`preset metadata must be a mapping: ${path}`)
  }
  return value as Record<string, unknown>
}

function rowsAt(path: string, directory: string): PresetDefinition['plugins'] {
  const value: unknown = parse(readFileSync(path, 'utf8'), { uniqueKeys: true })
  if (!Array.isArray(value)) throw new Error(`preset composition must be a list: ${path}`)
  const normalize = (rows: unknown[]): PresetDefinition['plugins'] => rows.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`preset composition has an invalid row: ${path}`)
    }
    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' && row.name.startsWith('./')
      ? pathToFileURL(resolve(directory, row.name)).href : row.name
    const config = Array.isArray(row.config) ? normalize(row.config) : row.config
    return { ...row, name, config } as PresetDefinition['plugins'][number]
  })
  return normalize(value)
}

/** Declare the bundled composition through the official rc.2 registry. */
export function declareBundledPreset(ctx: Context, id: string, directory: string): void {
  let closed = false
  let pending: Promise<void> | undefined
  let release: (() => Promise<void>) | undefined
  const start = (): void => {
    if (closed || pending) return
    const registry = ctx.get('agentPresets')
    if (!registry) return
    pending = (async () => {
      const metadata = readObject(join(directory, 'preset.yml'))
      const definition: PresetDefinition = {
        id,
        name: typeof metadata.name === 'string' ? metadata.name : id,
        description: typeof metadata.description === 'string' ? metadata.description : undefined,
        order: typeof metadata.order === 'number' ? metadata.order : undefined,
        plugins: rowsAt(join(directory, 'agent.cordis.yml'), directory),
      }
      const dispose = await registry.register(definition)
      if (closed) await dispose()
      else release = dispose
    })().catch(error => {
      ctx.logger?.warn?.(`${id}: preset declaration failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  ctx.inject(['agentPresets'], start)
  ctx.effect(() => {
    start()
    return async () => {
      closed = true
      await pending
      await release?.()
    }
  }, `${id}: preset declaration`)
}
