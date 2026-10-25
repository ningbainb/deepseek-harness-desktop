import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-desktop-client-hmr', ['src/index.ts'], {
  libExternal: ['@deepseek-ai/schemastery'],
})
