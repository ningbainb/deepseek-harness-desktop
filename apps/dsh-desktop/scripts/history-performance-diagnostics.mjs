// Bounded, content-free metadata shared by private-history diagnostics.
const codes = new Set(['session/attachment-invalid', 'session/not-found', 'gateway/internal'])
const reasons = new Set(['ATTACHMENT_NOT_FOUND', 'ATTACHMENT_NOT_REFERENCED', 'ATTACHMENT_CORRUPT',
  'ATTACHMENT_READ_FAILED', 'INVALID_ATTACHMENT_REF', 'INVALID_IMAGE'])

export function rpcOutcome(body) {
  const result = body?.result
  const outcome = { applicationOk: typeof result?.ok === 'boolean' ? result.ok : null }
  if (result?.ok === false) {
    outcome.errorCode = codes.has(result.error?.code) ? result.error.code : 'other'
    outcome.reason = reasons.has(result.error?.details?.reason) ? result.error.details.reason : 'other'
  }
  return outcome
}

export function networkTiming(timing) {
  const elapsed = (start, end) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start
    ? Math.round(end - start) : null
  return {
    requestDispatchMs: elapsed(0, timing?.requestStart),
    responseWaitMs: elapsed(timing?.requestStart, timing?.responseStart),
    responseBodyMs: elapsed(timing?.responseStart, timing?.responseEnd),
    networkTotalMs: elapsed(0, timing?.responseEnd),
  }
}

/** Return only a caller-supplied public label, never an arbitrary script URL. */
export function profileSource(rawUrl, sources) {
  if (typeof rawUrl !== 'string' || !rawUrl) return '(inline-or-native)'
  let url = rawUrl
  try { url = decodeURIComponent(url) } catch { /* Still compare the literal URL. */ }
  url = url.replaceAll('\\', '/')
  for (const { label, markers } of sources) {
    for (const marker of markers) {
      const offset = url.indexOf(marker)
      if (offset < 0) continue
      const end = offset + marker.length
      if (end === url.length || '/?#'.includes(url[end])) return label
    }
  }
  return '(unattributed)'
}

/** Indexed source maps assign a distinct package to each segment of a combo. */
export function profileComboSource(frame, combos) {
  return profileComboPosition(frame, combos)?.label
}

/** Package-relative generated coordinates contain no user data or script URLs. */
export function profileComboPosition(frame, combos) {
  const sections = combos.get(frame?.url)
  if (!sections || !Number.isSafeInteger(frame.lineNumber) || frame.lineNumber < 0
    || !Number.isSafeInteger(frame.columnNumber) || frame.columnNumber < 0) return undefined
  for (let index = sections.length - 1; index >= 0; index--) {
    const section = sections[index]
    if (frame.lineNumber > section.line || (frame.lineNumber === section.line && frame.columnNumber >= section.column)) {
      return { label: section.label, line: frame.lineNumber - section.line,
        column: frame.columnNumber - (frame.lineNumber === section.line ? section.column : 0) }
    }
  }
  return undefined
}

/** Diagnose unmapped URL forms without emitting hosts, paths, queries or ids. */
export function profileUrlShape(rawUrl) {
  const length = typeof rawUrl === 'string' ? rawUrl.length : 0
  if (!length) return { protocol: 'empty', path: 'none', length: 0 }
  try {
    const url = new URL(rawUrl)
    const protocol = ['http:', 'https:', 'file:', 'blob:'].includes(url.protocol) ? url.protocol : 'other'
    const path = url.pathname === '/plugins/' ? 'plugin-combo'
      : url.pathname.startsWith('/plugins/') ? 'plugin-file'
        : url.pathname.startsWith('/assets/') ? 'frontend-asset' : 'other'
    return { protocol, path, length }
  } catch { return { protocol: 'non-url', path: 'none', length } }
}

/** Accept a bounded profiler URL only when it identifies exactly one known artifact. */
export function profileUrlAliases(observedUrls, artifactUrl, artifactUrls) {
  return [...observedUrls].filter(observed => {
    if (observed === artifactUrl) return true
    if (typeof observed !== 'string' || observed.length !== 1024 || artifactUrl.length <= observed.length
      || !artifactUrl.startsWith(observed)) return false
    return artifactUrls.filter(url => url.startsWith(observed)).length === 1
  })
}
