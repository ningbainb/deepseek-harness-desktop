import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(desktopRoot, '..', '..')
const source = resolve(desktopRoot, 'build', 'icon-source-v2.png')
const check = process.argv.includes('--check')
// The selected artwork includes a transparent generation fringe outside the
// rounded-square icon. Crop that fringe once here so every platform receives
// the same clean silhouette without maintaining edited derivative sources.
const sourceCrop = { left: 85, top: 106, width: 1085, height: 1054 }

const pngSizes = [16, 24, 32, 48, 64, 128, 256]
const icnsTypes = [
  ['ic10', 1024],
  ['ic09', 512],
  ['ic14', 512],
  ['ic08', 256],
  ['ic13', 256],
  ['ic07', 128],
  ['icp6', 64],
  ['ic12', 64],
  ['icp5', 32],
  ['ic11', 32],
  ['icp4', 16],
]

async function png(size) {
  const inset = Math.max(1, Math.round(size * 0.04))
  const artworkSize = size - inset * 2
  return sharp(source)
    .extract(sourceCrop)
    .resize(artworkSize, artworkSize, {
      fit: 'contain',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(images.length * 16)
  let offset = header.length + directory.length
  images.forEach(({ size, data }, index) => {
    const row = index * 16
    directory.writeUInt8(size === 256 ? 0 : size, row)
    directory.writeUInt8(size === 256 ? 0 : size, row + 1)
    directory.writeUInt8(0, row + 2)
    directory.writeUInt8(0, row + 3)
    directory.writeUInt16LE(1, row + 4)
    directory.writeUInt16LE(32, row + 6)
    directory.writeUInt32LE(data.length, row + 8)
    directory.writeUInt32LE(offset, row + 12)
    offset += data.length
  })
  return Buffer.concat([header, directory, ...images.map(image => image.data)])
}

function icns(images) {
  const chunks = images.map(({ type, data }) => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

function roundedTile(width, height, radius, color) {
  const data = Buffer.alloc(width * height * 4)
  const [red, green, blue] = color
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cornerX = x < radius ? radius - x : x >= width - radius ? x - (width - radius - 1) : 0
      const cornerY = y < radius ? radius - y : y >= height - radius ? y - (height - radius - 1) : 0
      const inside = cornerX === 0 || cornerY === 0 || (cornerX * cornerX + cornerY * cornerY <= radius * radius)
      if (!inside) continue
      const offset = (y * width + x) * 4
      data[offset] = red
      data[offset + 1] = green
      data[offset + 2] = blue
      data[offset + 3] = 255
    }
  }
  return { input: data, raw: { width, height, channels: 4 } }
}

async function preview(imagesBySize) {
  const width = 720
  const height = 240
  const sizes = [16, 24, 32, 48, 64, 96]
  const panels = []
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < sizes.length; column += 1) {
      const size = sizes[column]
      const x = 20 + column * 112
      const y = 16 + row * 112
      const tileWidth = 96
      const tileHeight = 96
      panels.push({
        ...roundedTile(tileWidth, tileHeight, 8, row === 0 ? [255, 255, 255] : [7, 21, 47]),
        left: x,
        top: y,
      })
      const icon = imagesBySize.get(size) ?? await png(size)
      panels.push({
        input: icon,
        left: x + Math.floor((tileWidth - size) / 2),
        top: y + Math.floor((tileHeight - size) / 2),
      })
    }
  }
  return sharp({ create: { width, height, channels: 4, background: '#eef2f7' } })
    .composite(panels)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function expectedOutputs() {
  const rendered = new Map()
  for (const size of new Set([1024, ...pngSizes, ...icnsTypes.map(([, size]) => size), 96])) {
    rendered.set(size, await png(size))
  }
  const appPng = rendered.get(1024)
  assert.ok(appPng)
  const sidebarPng = rendered.get(64)
  assert.ok(sidebarPng)
  return new Map([
    [resolve(desktopRoot, 'build', 'icon.png'), appPng],
    [resolve(desktopRoot, 'build', 'icon.ico'), ico(pngSizes.map(size => ({ size, data: rendered.get(size) })))],
    [resolve(desktopRoot, 'build', 'icon.icns'), icns(icnsTypes.map(([type, size]) => ({ type, data: rendered.get(size) })))],
    [resolve(repositoryRoot, 'docs', 'brand', 'app-icon.png'), appPng],
    [resolve(repositoryRoot, 'website', 'assets', 'app-icon.png'), appPng],
    [resolve(repositoryRoot, 'docs', 'brand', 'app-icon-size-check.png'), await preview(rendered)],
    [resolve(repositoryRoot, 'packages', 'dsh-web-ui-settings', 'src', 'client', 'app-brand-icon.generated.ts'), Buffer.from(
      `// Generated by apps/dsh-desktop/scripts/generate-app-icons.mjs. Do not edit by hand.\nexport const APP_BRAND_ICON_DATA_URL = ${JSON.stringify(`data:image/png;base64,${sidebarPng.toString('base64')}`)}\n`,
    )],
  ])
}

const outputs = await expectedOutputs()
const stale = []
for (const [path, expected] of outputs) {
  if (check) {
    const actual = await readFile(path).catch(() => undefined)
    if (actual === undefined || !actual.equals(expected)) stale.push(path)
    continue
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, expected)
}

if (check && stale.length > 0) {
  throw new Error(`generated app icon assets are stale:\n${stale.join('\n')}`)
}

console.log(check ? `verified ${outputs.size} app icon assets` : `generated ${outputs.size} app icon assets`)
