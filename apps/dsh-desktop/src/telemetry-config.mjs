import { readFile as readFileDefault } from 'node:fs/promises'
import { join } from 'node:path'

const CONFIG_FILE_NAME = 'telemetry-config.json'

function exactConfiguration(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 1
    && Object.hasOwn(value, 'endpoint')
    && typeof value.endpoint === 'string'
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
  explicitlyEnabled = false,
}) {
  if (testEndpoint !== undefined) return validEndpoint(testEndpoint, { allowLocalHttp: true })
  // Desktop 3.0 never enables collection merely because an official build
  // happens to contain an endpoint. A future opt-in surface must pass this
  // explicit flag after recording the user's choice locally.
  if (explicitlyEnabled !== true) return undefined
  if (isPackaged !== true || typeof resourcesPath !== 'string' || resourcesPath.length === 0) return undefined
  let configuration
  try {
    configuration = JSON.parse(await readFile(join(resourcesPath, CONFIG_FILE_NAME), 'utf8'))
  } catch {
    return undefined
  }
  if (!exactConfiguration(configuration) || configuration.endpoint.length === 0) return undefined
  return validEndpoint(configuration.endpoint)
}

export const TELEMETRY_CONFIG_FILE_NAME = CONFIG_FILE_NAME
