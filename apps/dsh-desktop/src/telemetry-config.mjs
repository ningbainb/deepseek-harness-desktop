import { readFile as readFileDefault } from 'node:fs/promises'
import { join } from 'node:path'

const CONFIG_FILE_NAME = 'telemetry-config.json'

function exactConfiguration(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'endpoint')
    && typeof value.endpoint === 'string'
    && Object.hasOwn(value, 'officialBuild')
    && typeof value.officialBuild === 'boolean'
}

function validEndpoint(value, { allowLocalHttp = false } = {}) {
  let endpoint
  try {
    endpoint = new URL(value)
  } catch {
    return undefined
  }
  const localHttp = allowLocalHttp
    && endpoint.protocol === 'http:'
    && (endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost' || endpoint.hostname === '::1')
  if (endpoint.protocol !== 'https:' && !localHttp) return undefined
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return undefined
  if (endpoint.pathname !== '/v1/events') return undefined
  return endpoint.href
}

export async function resolveTelemetryEndpoint({
  isPackaged,
  resourcesPath,
  readFile = readFileDefault,
  testEndpoint,
}) {
  if (testEndpoint !== undefined) return validEndpoint(testEndpoint, { allowLocalHttp: true })
  if (isPackaged !== true || typeof resourcesPath !== 'string' || resourcesPath.length === 0) return undefined
  let configuration
  try {
    configuration = JSON.parse(await readFile(join(resourcesPath, CONFIG_FILE_NAME), 'utf8'))
  } catch {
    return undefined
  }
  if (!exactConfiguration(configuration) || configuration.officialBuild !== true || configuration.endpoint.length === 0) return undefined
  return validEndpoint(configuration.endpoint)
}

export const TELEMETRY_CONFIG_FILE_NAME = CONFIG_FILE_NAME
