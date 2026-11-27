import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function copyPdfAssets() {
  const require = createRequire(import.meta.url)
  const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'))
  const office = dirname(dirname(require.resolve('officeparser/slim')))
  const unpdf = dirname(dirname(require.resolve('unpdf')))
  const destination = fileURLToPath(new URL('../lib/pdf-assets/', import.meta.url))
  await mkdir(destination, { recursive: true })
  for (const entry of ['cmaps', 'standard_fonts', 'LICENSE']) {
    await cp(join(pdfjs, entry), join(destination, entry), { recursive: true })
  }
  await cp(join(office, 'LICENSE'), join(destination, 'LICENSE-officeparser'))
  await cp(join(unpdf, 'LICENSE'), join(destination, 'LICENSE-unpdf'))
  await cp(join(unpdf, 'dist', 'licenses'), join(destination, 'unpdf-licenses'), { recursive: true })
}
