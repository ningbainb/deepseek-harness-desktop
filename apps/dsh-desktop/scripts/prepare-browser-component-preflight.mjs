import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sdkRequire = createRequire(resolve(desktopRoot, '../../packages/dsh-web-ui-settings/package.json'))
const hash = value => createHash('sha256').update(value).digest('hex')
/** Builds only the owned helper; includes fflate/YAML, with no host Node or node_modules dependency. */
export async function prepareBrowserComponentPreflight({ outputDirectory = join(desktopRoot, 'build/browser-component-preflight') } = {}) {
  const { build } = await import(pathToFileURL(sdkRequire.resolve('tsdown')).href)
  const bin = join(outputDirectory, 'bin')
  await mkdir(join(outputDirectory, 'runtime-support'), { recursive: true })
  await build({ config: false, entry: { preflight: join(desktopRoot, 'src/browser-component-preflight-entry.mjs') },
    outDir: bin, format: 'esm', platform: 'node', target: 'node22', clean: true, dts: false,
    deps: { alwaysBundle: ['fflate', 'yaml'] },
  })
  const entryPath = join(bin, 'preflight.mjs')
  const manifestPath = join(outputDirectory, 'runtime-support/browser-component.json')
  await copyFile(join(desktopRoot, 'runtime-support/browser-component.json'), manifestPath)
  const entrySHA256 = hash(await readFile(entryPath)), manifestSHA256 = hash(await readFile(manifestPath))
  const includePath = join(dirname(outputDirectory), `${basename(outputDirectory)}.nsh`)
  await writeInclude(includePath, entrySHA256, manifestSHA256)
  return { entryPath, manifestPath, includePath, entrySHA256, manifestSHA256 }
}
async function writeInclude(includePath, entrySHA256, manifestSHA256) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(includePath, `!define DSH_BROWSER_PREFLIGHT_SHA256 "${entrySHA256}"\n!define DSH_BROWSER_COMPONENT_MANIFEST_SHA256 "${manifestSHA256}"\n`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareBrowserComponentPreflight()))
