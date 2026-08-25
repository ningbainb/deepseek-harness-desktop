import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-desktop-compat', [
  'src/index.ts',
  'src/recovery.ts',
  'src/session-recovery.ts',
  'src/workspace-file-open-policy.ts',
], {
  libExternal: [
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-tools',
  ],
})
