export function visualViewportExtentForDomRect(extent, devicePixelRatio) {
  if (!Number.isFinite(extent) || extent < 0 || !Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    throw new TypeError('viewport extent and device scale must be finite and valid')
  }
  const physicalExtent = Math.fround(extent * devicePixelRatio)
  return Math.fround(physicalExtent * Math.fround(1 / devicePixelRatio))
}
