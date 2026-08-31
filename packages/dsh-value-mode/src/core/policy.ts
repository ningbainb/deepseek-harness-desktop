import type { ValueModeConfig, ValueModeRole } from './config.ts'
import { resolveResolvedConfig } from './config.ts'

export const VALUE_MODE_SECTION_NAME = 'value-mode:guidance'
export const VALUE_MODE_SECTION_ORDER = 145

export function buildSystemPromptGuidance(
  config: ValueModeConfig,
  options: { role?: ValueModeRole } = {},
): string {
  const resolved = resolveResolvedConfig(config)
  if (!resolved.enabled) return ''

  if (options.role === 'subagent') {
    return (
      '[性价比模式·副模型子代理] 你是专家主控模型派发的执行代理，只完成当前明确的单项任务。' +
      '不要再次派发子代理，不要调用 subagent、subagent_fork 或 consult_expert；不要越界修改无关内容。' +
      '优先给出可验证的结果、证据、风险和下一步建议，由专家主控负责最终汇总与交付。'
    )
  }

  const strategy = resolved.strategy
  const delegationGuidance = strategy === 'saver'
    ? '优先直接处理；只有任务能明确拆分、需要并行调查或确实耗时较高时才使用 subagent。'
    : strategy === 'powerful'
      ? '遇到复杂架构、疑难根因、安全关键逻辑或大型重构时，积极使用 subagent 并要求其返回证据。'
      : '遇到复杂架构、疑难根因、并行调查、安全关键逻辑或大型重构时，按需使用 subagent。'

  return (
    `[性价比模式·${strategy === 'saver' ? '更省' : strategy === 'powerful' ? '更强' : '智能平衡'}·专家主控] ` +
    '你是本次会话的专家主控模型，负责理解任务、拆解工作、选择是否派发子代理、审查结果并对最终交付负责。' +
    '常规编码、工具调用和验证可直接完成。' +
    delegationGuidance +
    '派发后要明确任务边界和验收标准，收到子代理结果后自行核对，必要时补充修改与测试；不要为了形式强行创建子代理。'
  )
}

export function buildExpertSystemPrompt(purpose: string): string {
  return (
    'You are a senior technical expert consultant in Value Mode (性价比模式). ' +
    'Your goal is to provide concise, authoritative analysis, root causes, architecture recommendations, risk mitigation, and code review findings. ' +
    'Do not output raw code dumps unless necessary for precision. ' +
    'Do not perform tool calls or attempt to execute commands. ' +
    'Structure your response clearly with: Summary, Root Cause / Key Tradeoffs, Concrete Recommendations, and Verification Steps. ' +
    `Current consultation purpose: ${purpose}.`
  )
}
