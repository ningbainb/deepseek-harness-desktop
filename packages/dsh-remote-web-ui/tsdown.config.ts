import { clientBundle, mobileBundle } from '../../shared/tsdown.client.ts'

export const REMOTE_WEB_UI_CLIENT_ONLY_BUNDLE = ['clsx', 'qrcode.react']

export const REMOTE_WEB_UI_LIB_EXTERNAL = [
  /^@deepseek-ai\/dsh-host-apiproxy/,
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-cmdline',
  'commander',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-settings',
]

export default clientBundle('@linxin666/dsh-remote-web-ui', ['src/index.ts', 'src/invariant.ts', 'src/startup.ts'], {
  clientOnlyBundle: REMOTE_WEB_UI_CLIENT_ONLY_BUNDLE,
  libExternal: REMOTE_WEB_UI_LIB_EXTERNAL,
  companions: [mobileBundle('@linxin666/dsh-remote-web-ui', 'src/mobile/index.tsx')],
})
