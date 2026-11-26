import { spawn } from 'node:child_process';
export const UPSTREAM_UIA_ISSUE = 'https://github.com/CursorTouch/Windows-MCP/issues/607';
export const PROBE_TIMEOUT_MS = 6000;
const MAX_PROBE_OUTPUT = 16 * 1024;
// ASCII-only PowerShell probe so Windows code-page differences cannot corrupt JSON output.
const PROBE_SCRIPT = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$uia = -1',
    'try { Add-Type -AssemblyName UIAutomationClient | Out-Null; $root = [System.Windows.Automation.AutomationElement]::RootElement; $uia = @($root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)).Count } catch { $uia = -1 }',
    '$win = -1',
    'try { $win = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }).Count } catch { $win = -1 }',
    '$scale = -1',
    'try { Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class DshDpiProbe { [DllImport("user32.dll")] public static extern uint GetDpiForSystem(); }\' | Out-Null; $scale = [math]::Round([DshDpiProbe]::GetDpiForSystem() / 96.0, 3) } catch { $scale = -1 }',
    'Write-Output (\'{"uia":\' + $uia + \',"windows":\' + $win + \',"scale":\' + $scale + \'}\')',
].join('; ');
/** Read the last valid JSON metrics object from probe stdout. */
export function parseProbeOutput(text) {
    if (typeof text !== 'string' || text === '')
        return null;
    const lines = text.split(/\r?\n/u);
    for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (!trimmed.startsWith('{'))
            continue;
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
            continue;
        }
        if (parsed === null || typeof parsed !== 'object')
            continue;
        const record = parsed;
        const uia = Number(record.uia);
        const windows = Number(record.windows);
        const scale = Number(record.scale);
        if (!Number.isInteger(uia) || !Number.isInteger(windows) || !Number.isFinite(scale))
            continue;
        return {
            uiaWindows: uia >= 0 ? uia : null,
            windowHandles: windows >= 0 ? windows : null,
            displayScale: scale > 0 ? scale : null,
        };
    }
    return null;
}
/** Format a probe outcome and emit actionable UIA/DPI advisories. */
export function describeProbe(probe) {
    if (!probe)
        return { line: '未检测', notes: [] };
    if ('error' in probe)
        return { line: `未检测（${probe.error}）`, notes: [] };
    if ('skipped' in probe)
        return { line: `未检测（${probe.skipped}）`, notes: [] };
    const parts = [
        probe.uiaWindows === null
            ? 'UI Automation 不可用'
            : `UI Automation 可见 ${probe.uiaWindows} 个顶层窗口`,
    ];
    if (probe.windowHandles !== null)
        parts.push(`${probe.windowHandles} 个 Win32 窗口句柄`);
    if (probe.displayScale !== null)
        parts.push(`系统缩放 ${Math.round(probe.displayScale * 100)}%`);
    const notes = [];
    if (probe.windowHandles !== null && probe.windowHandles >= 3 && probe.uiaWindows !== null && probe.uiaWindows <= 1) {
        notes.push(`检测到 UI Automation 仅可见 ${probe.uiaWindows} 个窗口，但系统存在 ${probe.windowHandles} 个窗口句柄（上游已知问题 ${UPSTREAM_UIA_ISSUE}）。注销 Windows 会话或重启可恢复 UIA 服务。`);
    }
    if (probe.displayScale !== null && probe.displayScale >= 1.25) {
        notes.push(`主显示器当前缩放为 ${Math.round(probe.displayScale * 100)}%（上游 #607 存在高 DPI 绝对坐标缩放偏差）。建议优先使用 Snapshot 无障碍树节点定位而非纯屏幕坐标点击。`);
    }
    return { line: parts.join('，'), notes };
}
/** Run the read-only desktop UIA & DPI probe once without throwing. */
export function probeDesktop(options = {}) {
    const platform = options.platform ?? process.platform;
    if (platform !== 'win32')
        return Promise.resolve({ skipped: `非 Windows 平台 (${platform})` });
    const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs : PROBE_TIMEOUT_MS;
    const launcher = options.spawnImpl ?? spawn;
    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        let child = null;
        const finish = (outcome) => {
            if (settled)
                return;
            settled = true;
            if (timer !== null)
                clearTimeout(timer);
            resolve(outcome);
        };
        try {
            timer = setTimeout(() => {
                try {
                    child?.kill();
                }
                catch { }
                finish({ error: `超时 (${timeoutMs}ms)` });
            }, timeoutMs);
            child = launcher('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PROBE_SCRIPT], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        }
        catch (error) {
            finish({ error: error instanceof Error ? error.message : String(error) });
            return;
        }
        let stdout = '';
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk) => {
            if (stdout.length < MAX_PROBE_OUTPUT)
                stdout += chunk;
        });
        child.on('error', (error) => finish({ error: error.message }));
        child.on('close', () => {
            const parsed = parseProbeOutput(stdout);
            finish(parsed ?? { error: '未解析到探测结果' });
        });
    });
}
