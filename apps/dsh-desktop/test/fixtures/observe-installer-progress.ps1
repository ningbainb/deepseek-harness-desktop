param([int] $InstallerPid, [string] $InstallerPath, [string] $OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ProgressProbe {
  public delegate bool Visitor(IntPtr hwnd, IntPtr unused);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor callback, IntPtr unused);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint owner);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
  public static IntPtr Window(uint pid) {
    IntPtr result = IntPtr.Zero;
    EnumWindows((hwnd, unused) => { uint owner; GetWindowThreadProcessId(hwnd, out owner); if (owner == pid && IsWindowVisible(hwnd)) { result=hwnd; return false; } return true; }, IntPtr.Zero);
    return result;
  }
  public static string Text(IntPtr hwnd) { var value=new StringBuilder(4096); GetWindowText(hwnd, value, value.Capacity); return value.ToString(); }
}
'@
$ownedFixture = $null
if ($InstallerPath) {
  # Explicitly visible GUI fixture; compile the observer before launching it
  # so even a fast preparation stage is measured from its beginning.
  $ownedFixture = Start-Process -FilePath $InstallerPath -WindowStyle Normal -PassThru
  $null = $ownedFixture.Handle
  $InstallerPid = $ownedFixture.Id
}
$rows = [Collections.Generic.List[object]]::new()
$deadline = [DateTime]::UtcNow.AddSeconds(50)
$saved = $false
$last = ''
while ([DateTime]::UtcNow -lt $deadline) {
  $window = [ProgressProbe]::Window($InstallerPid)
  if ($window -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 200; continue }
  $page = [ProgressProbe]::FindWindowEx($window, [IntPtr]::Zero, '#32770', $null)
  $bar = [ProgressProbe]::GetDlgItem($page, 1004)
  $title = [ProgressProbe]::Text([ProgressProbe]::GetDlgItem($window, 1037))
  $subtitle = [ProgressProbe]::Text([ProgressProbe]::GetDlgItem($window, 1038))
  $finish = [ProgressProbe]::GetDlgItem($page, 1201)
  $snapshot = "$title|$subtitle|$([ProgressProbe]::IsWindowVisible($finish))"
  if ($snapshot -ne $last) {
    $rows.Add([pscustomobject]@{
      title=$title; subtitle=$subtitle; marquee=(([ProgressProbe]::GetWindowLong($bar, -16) -band 8) -ne 0)
      detailsAvailable=([ProgressProbe]::GetDlgItem($page, 1027) -ne [IntPtr]::Zero)
      finished=[ProgressProbe]::IsWindowVisible($finish)
    })
    $last = $snapshot
  }
  if (-not $saved -and $title.StartsWith('2 / 3') -and $subtitle.Contains('00:')) {
    $rect = New-Object ProgressProbe+Rect
    [void][ProgressProbe]::GetWindowRect($window, [ref]$rect)
    $bitmap = [Drawing.Bitmap]::new($rect.Right - $rect.Left, $rect.Bottom - $rect.Top)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $dc = $graphics.GetHdc()
    try { [void][ProgressProbe]::PrintWindow($window, $dc, 2) } finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    $bitmap.Save((Join-Path $OutputDirectory 'working.png'))
    $bitmap.Dispose()
    $saved = $true
  }
  if ([ProgressProbe]::IsWindowVisible($finish)) {
    [void][ProgressProbe]::PostMessage($window, 273, [IntPtr]::new(1), [ProgressProbe]::GetDlgItem($window, 1))
    break
  }
  Start-Sleep -Milliseconds 400
}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'observations.json'), (ConvertTo-Json -InputObject @($rows.ToArray()) -Depth 4))
if ($ownedFixture) {
  if (-not $ownedFixture.WaitForExit(5000)) { $ownedFixture.Kill(); throw 'Owned UI fixture did not finish' }
  if ($ownedFixture.ExitCode -ne 0) { throw "UI fixture failed: $($ownedFixture.ExitCode)" }
  $ownedFixture.Dispose()
}
