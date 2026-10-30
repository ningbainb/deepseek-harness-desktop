import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-release-plugin-adapter', ['src/index.ts'], {
  libExternal: ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection'],
})
