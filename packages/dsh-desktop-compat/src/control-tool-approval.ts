import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { currentAgentWslPermission, type AgentWslPermission } from './agent-wsl-permission.ts'
import type { ConnectorRiskMatch } from './connectors/types.ts'

const BROWSER_PREFIXES = [
  'mcp__playwright-mcp__',
  'mcp__chrome-devtools-mcp__',
  'stagehand_',
] as const

const COMPUTER_PREFIXES = [
  'cua_driver_native__',
  'mcp__cua-driver-mcp__',
] as const

const BROWSER_OBSERVATION_NAMES = new Set([
  'browser_console_messages',
  'browser_network_requests',
  'browser_snapshot',
  'browser_take_screenshot',
  'get_console_message',
  'get_network_request',
  'list_console_messages',
  'list_network_requests',
  'list_pages',
  'performance_analyze_insight',
  'performance_stop_trace',
  'take_screenshot',
  'take_snapshot',
  'stagehand_extract',
  'stagehand_observe',
  'stagehand_screenshot',
])

const COMPUTER_OBSERVATION_PATTERN = /(?:^|_)(?:check_permissions|find_element|get_(?:active_window|app|cursor|desktop|display|element|monitors?|permissions?|screen|snapshot|window)|list_(?:apps?|displays?|monitors?|windows?)|screenshot|snapshot|window_snapshot)$/u

export interface ControlToolApprovalOptions {
  readonly fullAccessUnattended?: boolean
}

function stripPrefix(name: string, prefixes: readonly string[]): string | undefined {
  const prefix = prefixes.find(candidate => name.startsWith(candidate))
  return prefix === undefined ? undefined : name.slice(prefix.length)
}

function getDynamicService(ctx: Context, key: string): unknown {
  const ctxLike = ctx as unknown as { get?: (name: string) => unknown } & Record<string, unknown>
  return ctxLike.get?.(key) ?? ctxLike[key]
}

/**
 * Return true only when the active session runs under `danger-full-access` with
 * `approval` set to `'never'` (i.e. full unattended control without prompts).
 * Keeps `desktop-full-access-ask` (`approval: 'ask'`) and non-full-access
 * sandboxes gated by one-shot prompts.
 */
export function isFullAccessUnattendedSession(ctx: Context, exec: ToolExecution): boolean {
  const session = exec.agent?.session
  if (!session) return false
  const approval = getDynamicService(ctx, 'approval') as { effectivePolicy?: (s: unknown) => unknown } | undefined
  let policy: unknown
  try {
    policy = approval?.effectivePolicy?.(session)
  } catch {
    return false
  }
  if (policy !== 'never') return false

  const presets = getDynamicService(ctx, 'permissionPresets') as {
    current?: (s: unknown) => unknown
    permissionState?: (s: unknown) => { sandbox?: unknown } | undefined
  } | undefined
  let currentPreset: unknown
  let sessionSandbox: unknown
  try {
    currentPreset = presets?.current?.(session)
    sessionSandbox = presets?.permissionState?.(session)?.sandbox
  } catch {
    currentPreset = undefined
    sessionSandbox = undefined
  }
  const shellSandbox = (getDynamicService(ctx, 'shell') as { sandboxMode?: unknown } | undefined)?.sandboxMode
  return currentPreset === 'danger-full-access'
    || sessionSandbox === 'danger-full-access'
    || (currentPreset === undefined && sessionSandbox === undefined && shellSandbox === 'danger-full-access')
}

/** Classify Desktop control tools without inspecting arguments or page/window data. */
export function controlToolApprovalDecision(
  name: string,
  wslPermission: AgentWslPermission = 'ask',
  options: ControlToolApprovalOptions = {},
): PreToolDecision | undefined {
  if (name === 'desktop_wsl') {
    if (wslPermission === 'off') return { kind: 'deny', reason: 'Agent WSL 命令已由用户关闭，可在拓展坞的智能操控中调整。' }
    if (wslPermission === 'allow') return { kind: 'allow' }
    return { kind: 'ask', reason: 'WSL 命令在 Windows 沙箱之外运行，可能修改本机和 Linux 文件；本次命令需要单独确认。' }
  }
  const browserName = stripPrefix(name, BROWSER_PREFIXES)
  if (browserName !== undefined) {
    const normalized = name.startsWith('stagehand_') ? name : browserName
    if (BROWSER_OBSERVATION_NAMES.has(normalized)) return undefined
    return options.fullAccessUnattended === true
      ? undefined
      : { kind: 'ask', reason: '浏览器操作可能改变页面或外部状态，需要本次授权。' }
  }

  const computerName = stripPrefix(name, COMPUTER_PREFIXES)
  if (computerName !== undefined) {
    if (COMPUTER_OBSERVATION_PATTERN.test(computerName)) return undefined
    return options.fullAccessUnattended === true
      ? undefined
      : { kind: 'ask', reason: '鼠标、键盘或电脑输入操作需要本次授权。' }
  }
  return undefined
}

/** Classify office connector MCP calls into L0-L3 approval gates. */
export function connectorToolApprovalDecision(
  name: string,
  lookupRisk?: (toolName: string) => ConnectorRiskMatch | undefined,
): PreToolDecision | undefined {
  if (!lookupRisk) return undefined
  const risk = lookupRisk(name)
  if (!risk || risk.level === 'L0') return undefined
  const detail = risk.label?.zh ? `（${risk.label.zh}）` : ''
  if (risk.level === 'L3') {
    return {
      kind: 'ask',
      reason: `高风险外部操作${detail}：涉及发送消息、邮件、外部分享或付费操作，必须经人工确认后执行。`,
    }
  }
  if (risk.level === 'L2') {
    return {
      kind: 'ask',
      reason: `受控办公变更操作${detail}：涉及删除、批量写入或修改日程会议，请确认操作对象。`,
    }
  }
  return {
    kind: 'ask',
    reason: `办公写操作${detail}：将创建或更新目标内容，需要本次确认。`,
  }
}

/** Require one-shot approval for mutating Browser Use, Computer Use, WSL, and office connector actions. */
export function installControlToolApproval(
  ctx: Context,
  options: { lookupConnectorRisk?: (toolName: string) => ConnectorRiskMatch | undefined } = {},
): void {
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next) => {
    const decision = controlToolApprovalDecision(
      exec.name,
      exec.name === 'desktop_wsl' ? currentAgentWslPermission() : 'ask',
      { fullAccessUnattended: isFullAccessUnattendedSession(ctx, exec) },
    ) ?? connectorToolApprovalDecision(exec.name, options.lookupConnectorRisk)
    return decision ?? next()
  })
}
