param(
  [Parameter(Mandatory = $true)][int] $InstallerPid,
  [Parameter(Mandatory = $true)][long] $WindowHandle,
  [Parameter(Mandatory = $true)][string] $ProgressLogPath
)

# Read-only observer. Never writes install files, terminates a process, or
# reports success itself. Losing this optional UI helper cannot fail setup.
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace DshInstallerProgress {
  public static class Native {
    [StructLayout(LayoutKind.Sequential)]
    public struct Io { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window, int id);
    [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder value, int size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wparam, string text, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW")] static extern IntPtr SendNumberTimeout(IntPtr window, uint message, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out IntPtr result);
    [DllImport("kernel32.dll")] public static extern bool GetProcessIoCounters(IntPtr process, out Io counters);
    public static bool Owns(IntPtr window, uint pid) { uint owner; GetWindowThreadProcessId(window, out owner); return owner == pid; }
    public static void Text(IntPtr window, string text) { IntPtr result; SendMessageTimeout(window, 12, IntPtr.Zero, text, 2, 200, out result); }
    public static void Number(IntPtr window, uint message, int wparam, int lparam) { IntPtr result; SendNumberTimeout(window, message, new IntPtr(wparam), new IntPtr(lparam), 2, 200, out result); }
    public static bool IsProgress(IntPtr window) { var cls = new StringBuilder(64); GetClassName(window, cls, 64); return cls.ToString() == "msctls_progress32"; }
  }
}
'@

  $window = [IntPtr]::new($WindowHandle)
  if (-not [DshInstallerProgress.Native]::Owns($window, $InstallerPid)) { exit 0 }
  $process = [Diagnostics.Process]::GetProcessById($InstallerPid)
  $started = $process.StartTime.ToUniversalTime()
  $previousStage = ''
  $stageStarted = [DateTime]::UtcNow
  $lastActivity = [DateTime]::UtcNow
  [uint64] $lastBytes = 0
  $log = ''
  while (-not $process.HasExited -and [DshInstallerProgress.Native]::Owns($window, $InstallerPid)) {
    # The log is bounded and private to this installer attempt. Open shared so
    # observing it cannot interfere with NSIS diagnostic writes or cleanup.
    try {
      $stream = [IO.File]::Open($ProgressLogPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
      try {
        if ($stream.Length -le 262144) {
          $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::Unicode)
          try { $log = $reader.ReadToEnd() } finally { $reader.Dispose() }
        }
      } finally { $stream.Dispose() }
    } catch { }
    $stages = [regex]::Matches($log, '(?m)^stage=([a-z-]+) code=([^\r\n]+)')
    if ($stages.Count -eq 0) { Start-Sleep -Milliseconds 500; continue }
    $entry = $stages[$stages.Count - 1]
    $stage = $entry.Groups[1].Value
    $code = $entry.Groups[2].Value
    # Never overwrite an error dialog, rollback status, or the finish page.
    if ($stage -in @('completed', 'installation-aborted', 'old-uninstaller', 'commit-rollback', 'failure-rollback')) { break }
    if ($code -notin @('0', 'pending')) { Start-Sleep -Milliseconds 500; continue }
    $page = [DshInstallerProgress.Native]::FindWindowEx($window, [IntPtr]::Zero, '#32770', $null)
    $bar = [DshInstallerProgress.Native]::GetDlgItem($page, 1004)
    if (-not [DshInstallerProgress.Native]::IsProgress($bar) -or
        -not [DshInstallerProgress.Native]::IsWindowVisible($bar)) { break }
    if ($stage -ne $previousStage) {
      $previousStage = $stage
      $stageStarted = [DateTime]::UtcNow
      $lastActivity = $stageStarted
    }
    $io = New-Object DshInstallerProgress.Native+Io
    if ([DshInstallerProgress.Native]::GetProcessIoCounters($process.Handle, [ref] $io)) {
      $bytes = $io.ReadBytes + $io.WriteBytes
      if ($bytes -ne $lastBytes) { $lastActivity = [DateTime]::UtcNow; $lastBytes = $bytes }
    }
    $elapsed = [DateTime]::UtcNow - $started
    $duration = '{0:00}:{1:00}' -f [Math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds
    $phase = switch ($stage) {
      'replace-files' { '2 / 3  解压并安装文件' }
      { $_ -in @('commit-start', 'commit') } { '3 / 3  校验并完成安装' }
      default { '1 / 3  准备安装与保护旧版' }
    }
    $status = if (([DateTime]::UtcNow - $lastActivity).TotalSeconds -ge 20) {
      '暂未观察到新的文件读写，正在等待系统返回；可展开详情。'
    } elseif ($stage -eq 'replace-files') {
      '正在处理应用文件。此阶段耗时取决于文件数量和磁盘速度。'
    } elseif ($stage -in @('commit-start', 'commit')) {
      '正在校验新版本并提交安装结果，请勿关闭安装程序。'
    } else {
      '正在检查旧进程并准备可恢复的升级备份。'
    }
    # Header controls are owned by this exact installer, not a global window.
    [DshInstallerProgress.Native]::Text([DshInstallerProgress.Native]::GetDlgItem($window, 1037), $phase)
    [DshInstallerProgress.Native]::Text([DshInstallerProgress.Native]::GetDlgItem($window, 1038), "已用 $duration  |  $status")
    Start-Sleep -Milliseconds 500
  }
} catch {
  # Native stage labels and animation remain available without this observer.
} finally {
  if ($null -ne $process) { $process.Dispose() }
}
