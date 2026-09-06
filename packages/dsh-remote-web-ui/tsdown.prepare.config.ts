import { clientBundle, mobileBundle } from '../../shared/tsdown.client.ts'
import {
  REMOTE_WEB_UI_CLIENT_ONLY_BUNDLE,
  REMOTE_WEB_UI_LIB_EXTERNAL,
} from './tsdown.config.ts'

/**
 * Consumer-side build for git installs (the `prepare` script): transpile
 * straight from src without tsc project references, which need the sibling
 * harness checkout that only dev machines and CI have. Types are NOT
 * checked here — `pnpm run typecheck` owns that. The client bundle is
 * emitted too: the modules node half serves lib/client.js to browsers, so a
 * git-installed package must ship it.
 */
export default clientBundle('@linxin666/dsh-remote-web-ui', ['src/index.ts', 'src/invariant.ts', 'src/startup.ts'], {
  clientOnlyBundle: REMOTE_WEB_UI_CLIENT_ONLY_BUNDLE,
  libExternal: REMOTE_WEB_UI_LIB_EXTERNAL,
  companions: [mobileBundle('@linxin666/dsh-remote-web-ui', 'src/mobile/index.tsx')],
})
