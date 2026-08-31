import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-value-mode', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-agent-default-model',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
    'schemastery',
  ],
})
