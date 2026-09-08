import { readFileSync } from 'node:fs'

const artifactUrl = new URL('../../runtime-support/community-plugin-known-issues.json', import.meta.url)
const artifact = JSON.parse(readFileSync(artifactUrl, 'utf8'))

function frozenIssue(raw) {
  return Object.freeze({
    id: raw.id,
    package: Object.freeze({ ...raw.package }),
    host: Object.freeze({ ...raw.host }),
    conflict: Object.freeze({ ...raw.conflict }),
    disposition: Object.freeze({ ...raw.disposition }),
    source: raw.source,
    verifiedAt: raw.verifiedAt,
  })
}

if (artifact?.schemaVersion !== 1 || !Array.isArray(artifact.issues)) {
  throw new TypeError('community plugin known-issues artifact is invalid')
}

export const COMMUNITY_PLUGIN_KNOWN_ISSUES = Object.freeze(artifact.issues.map(frozenIssue))

/**
 * Match only the exact package and host tuple that was reproduced. A future
 * plugin, Desktop, or Runtime version must be tested before it is classified.
 */
export function findCommunityPluginKnownIssue(manifest, host) {
  if (manifest === null || typeof manifest !== 'object' || host === null || typeof host !== 'object') {
    return undefined
  }
  return COMMUNITY_PLUGIN_KNOWN_ISSUES.find((issue) => (
    manifest.name === issue.package.name
    && manifest.version === issue.package.version
    && host.desktopVersion === issue.host.desktopVersion
    && host.runtimeVersion === issue.host.runtimeVersion
    && host.nodeVersion === issue.host.nodeVersion
  ))
}

export function knownIssueCompatibilityDetail(issue, host) {
  if (issue === undefined) return undefined
  return Object.freeze({
    requirements: Object.freeze({
      desktop: issue.host.desktopVersion,
      runtime: issue.host.runtimeVersion,
    }),
    tested: Object.freeze({
      desktop: issue.host.desktopVersion,
      runtime: issue.host.runtimeVersion,
      verifiedAt: issue.verifiedAt,
      matrixArtifact: 'runtime-support/community-plugin-known-issues.json',
    }),
    host: Object.freeze({
      desktop: host.desktopVersion,
      runtime: host.runtimeVersion,
      desktopApi: host.desktopApiVersion,
    }),
  })
}
