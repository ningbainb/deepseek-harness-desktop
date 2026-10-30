param([int] $TargetProcessId, [string] $ExpectedExecutable, [string] $LockFile, [string] $TemporaryDirectory)
$ErrorActionPreference = 'Stop'
if (-not (Get-Process -Id $TargetProcessId).Path.Equals($ExpectedExecutable, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'refusing to automate a different executable'
}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DshFixtureDialog {
  public delegate bool WindowCallback(IntPtr window, IntPtr state);
  [DllImport("user32.dll")] public static extern bool EnumWindows(WindowCallback callback, IntPtr state);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window, int id);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint msg, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  public static IntPtr RetryDialog(uint target) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((window, state) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == target && GetDlgItem(window, 4) != IntPtr.Zero && GetDlgItem(window, 2) != IntPtr.Zero) { found = window; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static IntPtr OkDialog(uint target) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((window, state) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == target && GetDlgItem(window, 1) != IntPtr.Zero && GetDlgItem(window, 2) == IntPtr.Zero) { found = window; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$deadline = [DateTime]::UtcNow.AddSeconds(20)
while (-not (Test-Path -LiteralPath (Join-Path $TemporaryDirectory 'prepared.txt'))) {
  if ([DateTime]::UtcNow -ge $deadline) { throw 'fixture did not prepare the upgrade' }
  Start-Sleep -Milliseconds 100
}
$lockStream = [IO.File]::Open($LockFile, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
[IO.File]::WriteAllText((Join-Path $TemporaryDirectory 'lock-ready.txt'), 'ready')
do {
  $window = [DshFixtureDialog]::RetryDialog([uint32] $TargetProcessId)
  if ($window -ne [IntPtr]::Zero) {
      $lockStream.Dispose()
      if (-not [DshFixtureDialog]::PostMessage($window, 0x111, [IntPtr] 2, [IntPtr]::Zero)) { throw 'cancel post failed' }
      Write-Output 'native-copy-dialog-cancelled'
      while (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue) {
        $ok = [DshFixtureDialog]::OkDialog([uint32] $TargetProcessId)
        if ($ok -ne [IntPtr]::Zero) { [void] [DshFixtureDialog]::PostMessage($ok, 0x111, [IntPtr] 1, [IntPtr]::Zero) }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'fixture did not finish after native cancellation' }
        Start-Sleep -Milliseconds 100
      }
      exit 0
  }
  if (-not (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue)) { throw 'fixture exited before copy failure dialog' }
  Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $deadline)
$window = [IntPtr]::Zero
do {
  $window = [DshFixtureDialog]::FindWindowEx([IntPtr]::Zero, $window, $null, $null)
  if ($window -eq [IntPtr]::Zero) { break }
  $windowPid = [uint32] 0
  [void] [DshFixtureDialog]::GetWindowThreadProcessId($window, [ref] $windowPid)
  if ($windowPid -eq $TargetProcessId) {
    $text = [Text.StringBuilder]::new(512)
    [void] [DshFixtureDialog]::GetWindowText($window, $text, 512)
    $buttons = @(1..10 | Where-Object { [DshFixtureDialog]::GetDlgItem($window, $_) -ne [IntPtr]::Zero }) -join ','
    Write-Output "fixture-window title=$text controls=$buttons"
  }
} while ($true)
throw 'native copy failure dialog did not appear'
} finally { $lockStream.Dispose() }
