import { readFileSync } from 'node:fs'

export function start(root) {
  const config = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'))
  if (config.enabled !== true) {
    const error = new Error('fixture config must enable the plugin')
    error.code = 'PLUGIN_CONFIG_INVALID'
    throw error
  }
  return 'ready'
}
