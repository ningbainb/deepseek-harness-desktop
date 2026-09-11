import { createRequire } from 'node:module'

async function bundledCompiler() {
  const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
  const builderRequire = createRequire(desktopRequire.resolve('electron-builder/package.json'))
  // Use the pinned packager's resolver: it owns cache locations, extraction
  // layout and the NSISDIR required by the compiler's include/plugin lookup.
  const { getMakeNsisPath } = builderRequire('app-builder-lib/out/toolsets/windows.js')
  return getMakeNsisPath()
}

export async function resolveNsisCompiler({
  environment = process.env,
  resolveBundledCompiler = bundledCompiler,
} = {}) {
  if (environment.DSH_NSIS_COMPILER) {
    return { path: environment.DSH_NSIS_COMPILER, env: { ...environment } }
  }
  const compiler = await resolveBundledCompiler()
  if (typeof compiler?.path !== 'string' || compiler.path.length === 0) {
    throw new Error('The installed electron-builder did not resolve an NSIS compiler')
  }
  return { path: compiler.path, env: { ...environment, ...compiler.env } }
}
