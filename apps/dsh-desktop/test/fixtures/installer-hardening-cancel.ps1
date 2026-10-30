param([int] $TargetProcessId, [string] $ExpectedExecutable, [string] $LockFile, [string] $TemporaryDirectory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$observerStarted = [DateTime]::UtcNow
Write-Output ('native-fixture-observation ' + (@{ phase='observer-start'; at=$observerStarted.ToString('o'); observerPid=$PID; targetPid=$TargetProcessId } | ConvertTo-Json -Compress))
if (-not (Get-Process -Id $TargetProcessId).Path.Equals($ExpectedExecutable, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'refusing to automate a different executable'
}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DshFixtureDialog {
  public delegate bool WindowCallback(IntPtr window, IntPtr state);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool EnumWindows(WindowCallback callback, IntPtr state);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool EnumChildWindows(IntPtr parent, WindowCallback callback, IntPtr state);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window, int id);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint msg, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetThreadDesktop(uint thread);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, uint size, out uint needed);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] public static extern void SetLastError(uint error);
  public static bool RetryEnumSucceeded;
  public static int RetryEnumError;
  public static bool RetryEnumStoppedOnMatch;
  public static IntPtr RetryDialog(uint target) {
    IntPtr found = IntPtr.Zero;
    SetLastError(0);
    RetryEnumSucceeded = EnumWindows((window, state) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == target && GetDlgItem(window, 4) != IntPtr.Zero && GetDlgItem(window, 2) != IntPtr.Zero) { found = window; return false; }
      return true;
    }, IntPtr.Zero);
    RetryEnumError = RetryEnumSucceeded ? 0 : Marshal.GetLastWin32Error();
    RetryEnumStoppedOnMatch = found != IntPtr.Zero;
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
  private static object UserObject(IntPtr handle) {
    var text = new StringBuilder(512);
    uint needed;
    SetLastError(0);
    bool success = GetUserObjectInformation(handle, 2, text, (uint)(text.Capacity * 2), out needed);
    int error = success ? 0 : Marshal.GetLastWin32Error();
    return new { handle=handle.ToInt64(), name=text.ToString(), success, error, bytesNeeded=needed };
  }
  private static object WindowInfo(IntPtr window) {
    uint pid, ownerPid=0;
    uint thread = GetWindowThreadProcessId(window, out pid);
    IntPtr owner = GetWindow(window, 4);
    if (owner != IntPtr.Zero) GetWindowThreadProcessId(owner, out ownerPid);
    var title = new StringBuilder(512);
    var cls = new StringBuilder(256);
    GetWindowText(window, title, title.Capacity);
    GetClassName(window, cls, cls.Capacity);
    return new { hwnd=window.ToInt64(), pid, threadId=thread, windowClass=cls.ToString(), title=title.ToString(),
      controlId=GetDlgCtrlID(window), visible=IsWindowVisible(window), enabled=IsWindowEnabled(window), ownerHwnd=owner.ToInt64(), ownerPid };
  }
  public static object Observe(uint target) {
    object targetState;
    try {
      using (var process = System.Diagnostics.Process.GetProcessById((int)target)) {
        targetState = new { pid=target, sessionId=process.SessionId, exited=process.HasExited };
      }
    } catch (Exception error) { targetState = new { pid=target, error=error.Message }; }
    var windows = new System.Collections.Generic.List<object>();
    SetLastError(0);
    bool success = EnumWindows((window, state) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid != target) return true;
      var controls = new System.Collections.Generic.List<object>();
      SetLastError(0);
      bool children = EnumChildWindows(window, (control, unused) => {
        uint controlPid; GetWindowThreadProcessId(control, out controlPid);
        if (controlPid == target) controls.Add(WindowInfo(control));
        return true;
      }, IntPtr.Zero);
      int childError = Marshal.GetLastWin32Error();
      // EnumChildWindows does not define a success return; retain its raw result.
      windows.Add(new { window=WindowInfo(window), controls=controls.ToArray(), childEnumeration=new { returned=children, lastError=childError } });
      return true;
    }, IntPtr.Zero);
    int enumerationError = success ? 0 : Marshal.GetLastWin32Error();
    using (var observer = System.Diagnostics.Process.GetCurrentProcess()) {
      uint thread = GetCurrentThreadId();
      return new { observer=new { pid=observer.Id, sessionId=observer.SessionId, threadId=thread,
          windowStation=UserObject(GetProcessWindowStation()), desktop=UserObject(GetThreadDesktop(thread)) },
        target=targetState, enumeration=new { success, error=enumerationError }, windows=windows.ToArray(),
        retryEnumeration=new { success=RetryEnumSucceeded, error=RetryEnumError, stoppedOnMatch=RetryEnumStoppedOnMatch } };
    }
  }
}
'@
$deadline = [DateTime]::UtcNow.AddSeconds(20)
function Write-FixtureObservation([string] $Phase) {
  try {
    $now = [DateTime]::UtcNow
    $markers = @{}
    foreach ($name in @('prepared.txt', 'lock-ready.txt', 'fixture-context.txt', 'fixture-phases.txt')) {
      $path = Join-Path $TemporaryDirectory $name
      if (Test-Path -LiteralPath $path) { $markers[$name] = [IO.File]::ReadAllText($path) }
    }
    Write-Output ('native-fixture-observation ' + (@{ phase=$Phase; at=$now.ToString('o'); elapsedMs=($now-$observerStarted).TotalMilliseconds;
      tickMs=[Environment]::TickCount; remainingMs=($deadline-$now).TotalMilliseconds;
      native=[DshFixtureDialog]::Observe([uint32] $TargetProcessId); markers=$markers } | ConvertTo-Json -Depth 10 -Compress))
  } catch {
    Write-Output ('native-fixture-observation ' + (@{ phase=$Phase; diagnosticError=$_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
$lockStream = $null
try {
Write-FixtureObservation 'waiting-prepared'
while (-not (Test-Path -LiteralPath (Join-Path $TemporaryDirectory 'prepared.txt'))) {
  if ([DateTime]::UtcNow -ge $deadline) { throw 'fixture did not prepare the upgrade' }
  Start-Sleep -Milliseconds 100
}
Write-FixtureObservation 'prepared-observed'
$lockStream = [IO.File]::Open($LockFile, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
[IO.File]::WriteAllText((Join-Path $TemporaryDirectory 'lock-ready.txt'), 'ready')
Write-FixtureObservation 'lock-ready-written'
do {
  $window = [DshFixtureDialog]::RetryDialog([uint32] $TargetProcessId)
  if ($window -ne [IntPtr]::Zero) {
      Write-FixtureObservation 'retry-dialog-matched'
      $lockStream.Dispose()
      if (-not [DshFixtureDialog]::PostMessage($window, 0x111, [IntPtr] 2, [IntPtr]::Zero)) { throw 'cancel post failed' }
      Write-Output 'native-copy-dialog-cancelled'
      Write-FixtureObservation 'cancel-posted'
      $lastOk = [IntPtr]::Zero
      while (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue) {
        $ok = [DshFixtureDialog]::OkDialog([uint32] $TargetProcessId)
        if ($ok -ne [IntPtr]::Zero -and $ok -ne $lastOk) { Write-FixtureObservation 'ok-dialog-matched'; $lastOk = $ok }
        if ($ok -ne [IntPtr]::Zero) { [void] [DshFixtureDialog]::PostMessage($ok, 0x111, [IntPtr] 1, [IntPtr]::Zero) }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'fixture did not finish after native cancellation' }
        Start-Sleep -Milliseconds 100
      }
      Write-FixtureObservation 'target-finished'
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
} catch {
  Write-FixtureObservation 'observer-failed'
  throw
} finally { if ($lockStream) { $lockStream.Dispose() } }
