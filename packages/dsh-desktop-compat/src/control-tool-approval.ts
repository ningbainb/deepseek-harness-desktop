import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { currentAgentWslPermission, type AgentWslPermission } from './agent-wsl-permission.ts'

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

function stripPrefix(name: string, prefixes: readonly string[]): string | undefined {
  const prefix = prefixes.find(candidate => name.startsWith(candidate))
  return prefix === undefined ? undefined : name.slice(prefix.length)
}

/** Classify Desktop control tools without inspecting arguments or page/window data. */
export function controlToolApprovalDecision(name: string, wslPermission: AgentWslPermission = 'ask'): PreToolDecision | undefined {
  if (name === 'desktop_wsl') {
    if (wslPermission === 'off') return { kind: 'deny', reason: 'Agent WSL 命令已由用户关闭，可在拓展坞的智能操控中调整。' }
    if (wslPermission === 'allow') return { kind: 'allow' }
    return { kind: 'ask', reason: 'WSL 命令在 Windows 沙箱之外运行，可能修改本机和 Linux 文件；本次命令需要单独确认。' }
  }
  const browserName = stripPrefix(name, BROWSER_PREFIXES)
  if (browserName !== undefined) {
    const normalized = name.startsWith('stagehand_') ? name : browserName
    return BROWSER_OBSERVATION_NAMES.has(normalized)
      ? undefined
      : { kind: 'ask', reason: '浏览器操作可能改变页面或外部状态，需要本次授权。' }
  }

  const computerName = stripPrefix(name, COMPUTER_PREFIXES)
  if (computerName !== undefined) {
    return COMPUTER_OBSERVATION_PATTERN.test(computerName)
      ? undefined
      : { kind: 'ask', reason: '鼠标、键盘或电脑输入操作需要本次授权。' }
  }
  return undefined
}

/** Require one-shot approval for mutating Browser Use and Computer Use actions. */
export function installControlToolApproval(ctx: Context): void {
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next) => {
    const decision = controlToolApprovalDecision(exec.name,
      exec.name === 'desktop_wsl' ? currentAgentWslPermission() : 'ask')
    return decision ?? next()
  })
}
