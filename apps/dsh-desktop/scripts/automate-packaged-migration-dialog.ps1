[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$ProcessId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('continue', 'rollback')]
  [string]$Decision,

  [ValidateSet('native', 'recovery')]
  [string]$Surface = 'native',

  [ValidateRange(1000, 120000)]
  [int]$TimeoutMs = 30000
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class NativeWindowOwner {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("oleacc.dll")]
  public static extern int AccessibleObjectFromWindow(
    IntPtr hWnd,
    int objectId,
    ref Guid riid,
    [MarshalAs(UnmanagedType.Interface)] out object accessibleObject
  );
}
'@

function Get-TargetProcessIds {
  param(
    [Parameter(Mandatory = $true)]
    [int]$RootProcessId
  )

  # Electron may host the native MessageBox in a short-lived child process.
  # Permit only the launched executable and its recursively owned children;
  # never broaden this to arbitrary Desktop windows.
  $processIds = New-Object 'System.Collections.Generic.HashSet[int]'
  [void]$processIds.Add($RootProcessId)
  try {
    $processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
  } catch {
    return @($RootProcessId)
  }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $processes) {
      $candidateId = 0
      $parentId = 0
      if (-not [int]::TryParse([string]$process.ProcessId, [ref]$candidateId)) { continue }
      if (-not [int]::TryParse([string]$process.ParentProcessId, [ref]$parentId)) { continue }
      if ($processIds.Contains($parentId) -and $processIds.Add($candidateId)) {
        $changed = $true
      }
    }
  }
  return @($processIds | ForEach-Object { [int]$_ })
}

function Format-TopLevelWindows {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Automation.AutomationElementCollection]$TopLevel
  )

  $windows = New-Object 'System.Collections.Generic.List[string]'
  foreach ($element in $TopLevel) {
    try {
      $current = $element.Current
      $windowProcessId = [int]$current.ProcessId
      $name = ([string]$current.Name).Replace("`r", ' ').Replace("`n", ' ')
      if ($name.Length -gt 96) { $name = "${name.Substring(0, 96)}..." }
      [void]$windows.Add("($windowProcessId,$name)")
      if ($windows.Count -ge 16) { break }
    } catch {
      # A transient window can disappear while UIAutomation is enumerating it.
    }
  }
  if ($windows.Count -eq 0) { return '<none>' }
  return ($windows -join '; ')
}

function Test-WindowOwnedByTarget {
  param(
    [Parameter(Mandatory = $true)]
    [int]$NativeWindowHandle,

    [Parameter(Mandatory = $true)]
    [int[]]$TargetProcessIds
  )

  if ($NativeWindowHandle -eq 0) { return $false }
  $window = [IntPtr]$NativeWindowHandle
  $seenHandles = New-Object 'System.Collections.Generic.HashSet[long]'
  while ($window -ne [IntPtr]::Zero) {
    if (-not $seenHandles.Add($window.ToInt64())) { return $false }
    [uint32]$windowProcessId = 0
    [void][NativeWindowOwner]::GetWindowThreadProcessId($window, [ref]$windowProcessId)
    if ($TargetProcessIds -contains ([int]$windowProcessId)) { return $true }
    $window = [NativeWindowOwner]::GetWindow($window, 4)
  }
  return $false
}

function Get-ExactNativeMsaaPushButton {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Automation.AutomationElement]$Element,

    [Parameter(Mandatory = $true)]
    [int[]]$TargetProcessIds,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedName
  )

  # Windows TaskDialog may expose CCPushButton children to UIA as Pane
  # controls without InvokePattern or LegacyIAccessiblePattern. A Pane alone
  # is never actionable: require a native HWND in the launched PID tree and
  # independently prove MSAA PushButton role, exact name, and default action.
  try {
    $nativeWindowHandle = [int64]$Element.Current.NativeWindowHandle
    if ($nativeWindowHandle -eq 0) { return $null }
    [uint32]$nativeProcessId = 0
    [void][NativeWindowOwner]::GetWindowThreadProcessId([IntPtr]$nativeWindowHandle, [ref]$nativeProcessId)
    if ($TargetProcessIds -notcontains ([int]$nativeProcessId)) { return $null }

    $accessibleObject = $null
    $accessibleGuid = [Guid]'618736E0-3C3D-11CF-810C-00AA00389B71'
    $hresult = [NativeWindowOwner]::AccessibleObjectFromWindow(
      [IntPtr]$nativeWindowHandle,
      -4, # OBJID_CLIENT
      [ref]$accessibleGuid,
      [ref]$accessibleObject
    )
    if ($hresult -ne 0 -or $null -eq $accessibleObject) { return $null }

    $accessibleName = [string]$accessibleObject.accName(0)
    $accessibleRole = [int]$accessibleObject.accRole(0)
    $accessibleDefaultAction = [string]$accessibleObject.accDefaultAction(0)
    if ($accessibleName -cne $ExpectedName -or $accessibleRole -ne 43) {
      return $null # ROLE_SYSTEM_PUSHBUTTON
    }
    if ([string]::IsNullOrWhiteSpace($accessibleDefaultAction)) { return $null }

    return [PSCustomObject]@{
      AccessibleObject = $accessibleObject
      DefaultAction = $accessibleDefaultAction
    }
  } catch {
    return $null
  }
}

function Format-DialogDescendants {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Automation.AutomationElementCollection]$Descendants
  )

  $items = New-Object 'System.Collections.Generic.List[string]'
  foreach ($element in $Descendants) {
    try {
      $current = $element.Current
      $controlType = $current.ControlType
      $typeName = if ($null -eq $controlType) { '<null>' } else { [string]$controlType.ProgrammaticName }
      $name = ([string]$current.Name).Replace("`r", ' ').Replace("`n", ' ')
      if ($name.Length -gt 96) { $name = "${name.Substring(0, 96)}..." }
      [void]$items.Add("(name=$name,type=$typeName,localizedType=$([string]$current.LocalizedControlType))")
      if ($items.Count -ge 12) { break }
    } catch {
      # A transient dialog child can disappear while UIAutomation is reading it.
    }
  }
  if ($items.Count -eq 0) { return '<none>' }
  return ($items -join '; ')
}

# Keep this script ASCII-only: Windows PowerShell 5.1 otherwise assumes the
# current legacy code page for a UTF-8 script without a BOM.
$dialogTitle = if ($Surface -eq 'recovery') {
  # DeepSeek Harness Desktop 修复
  -join [char[]]@(0x0044, 0x0065, 0x0065, 0x0070, 0x0053, 0x0065, 0x0065, 0x006B, 0x0020, 0x0048, 0x0061, 0x0072, 0x006E, 0x0065, 0x0073, 0x0073, 0x0020, 0x0044, 0x0065, 0x0073, 0x006B, 0x0074, 0x006F, 0x0070, 0x0020, 0x4FEE, 0x590D)
} else {
  # 升级迁移恢复
  -join [char[]]@(0x5347, 0x7EA7, 0x8FC1, 0x79FB, 0x6062, 0x590D)
}
$buttonName = if ($Decision -eq 'continue') {
  -join [char[]]@(0x7EE7, 0x7EED, 0x8FC1, 0x79FB)
} elseif ($Surface -eq 'recovery') {
  # 回滚迁移
  -join [char[]]@(0x56DE, 0x6EDA, 0x8FC1, 0x79FB)
} else {
  # 回滚并退出
  -join [char[]]@(0x56DE, 0x6EDA, 0x5E76, 0x9000, 0x51FA)
}
$deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
$lastError = $null
$lastTopLevelCount = 0
$lastDialogCount = 0
$lastButtonCount = 0
$lastDescendantCount = 0
$lastTargetProcessIds = @($ProcessId)
$lastTopLevelWindows = '<none>'
$lastOwnerMatchCount = 0
$lastDialogDescendants = '<none>'
$lastMsaaFallbackCount = 0

while ([DateTime]::UtcNow -lt $deadline) {
  if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
    throw 'Packaged Desktop exited before the migration dialog could be automated.'
  }
  try {
    # On some Windows 11 UIAutomation providers, FindFirst(PropertyCondition)
    # can miss a real native dialog. Enumerate only top-level windows, then
    # compare the same exact PID/title properties locally.
    $topLevel = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
      [System.Windows.Automation.TreeScope]::Children,
      [System.Windows.Automation.Condition]::TrueCondition
    )
    $lastTopLevelCount = $topLevel.Count
    $targetProcessIds = @(Get-TargetProcessIds -RootProcessId $ProcessId)
    $lastTargetProcessIds = $targetProcessIds
    $lastTopLevelWindows = Format-TopLevelWindows -TopLevel $topLevel
    $lastDialogCount = 0
    $lastButtonCount = 0
    $lastMsaaFallbackCount = 0
    $lastDescendantCount = 0
    $lastOwnerMatchCount = 0
    $dialog = $null
    foreach ($element in $topLevel) {
      $current = $element.Current
      $matchesTargetProcess = $targetProcessIds -contains ([int]$current.ProcessId)
      $matchesOwnedByTarget = $false
      if (-not $matchesTargetProcess) {
        $matchesOwnedByTarget = Test-WindowOwnedByTarget -NativeWindowHandle ([int]$current.NativeWindowHandle) -TargetProcessIds $targetProcessIds
      }
      if ($matchesOwnedByTarget) { $lastOwnerMatchCount += 1 }
      $matchesDialogTitle = ([string]$current.Name) -ceq $dialogTitle
      if (($matchesTargetProcess -or $matchesOwnedByTarget) -and $matchesDialogTitle) {
        $lastDialogCount += 1
        if ($null -eq $dialog) { $dialog = $element }
      }
    }
    if ($null -ne $dialog) {
      $descendants = $dialog.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
      )
      $lastDescendantCount = $descendants.Count
      $lastDialogDescendants = Format-DialogDescendants -Descendants $descendants
      $button = $null
      $msaaFallback = $null
      foreach ($element in $descendants) {
        $current = $element.Current
        $controlType = $current.ControlType
        $matchesButtonName = ([string]$current.Name) -ceq $buttonName
        $matchesButtonControlType = ($null -ne $controlType) -and ([int]$controlType.Id -eq [int][System.Windows.Automation.ControlType]::Button.Id)
        # The generic shell is intentionally created before migration
        # preflight and contains hidden placeholders for every action. Do not
        # invoke one of those unavailable controls while Electron is swapping
        # it for the migration-specific shell; only a rendered action counts.
        $matchesVisibleButton = -not [bool]$current.IsOffscreen
        if ($matchesButtonName -and $matchesButtonControlType -and $matchesVisibleButton) {
          $lastButtonCount += 1
          if ($null -eq $button) { $button = $element }
        }
        $matchesPaneControlType = ($null -ne $controlType) -and ([int]$controlType.Id -eq [int][System.Windows.Automation.ControlType]::Pane.Id)
        if ($null -eq $button -and $null -eq $msaaFallback -and $matchesButtonName -and $matchesPaneControlType -and $matchesVisibleButton) {
          $candidate = Get-ExactNativeMsaaPushButton -Element $element -TargetProcessIds $targetProcessIds -ExpectedName $buttonName
          if ($null -ne $candidate) {
            $lastMsaaFallbackCount += 1
            $msaaFallback = $candidate
          }
        }
      }
      if ($null -ne $button -and $button.Current.IsEnabled) {
        $pattern = [System.Windows.Automation.InvokePattern]$button.GetCurrentPattern(
          [System.Windows.Automation.InvokePattern]::Pattern
        )
        $pattern.Invoke()
        Write-Output "automated packaged migration decision: $Decision"
        exit 0
      }
      # Do not bypass an unavailable UIA Button with the Pane-only fallback.
      if ($null -eq $button -and $null -ne $msaaFallback) {
        $msaaFallback.AccessibleObject.accDoDefaultAction(0)
        Write-Output "automated packaged migration decision: $Decision (MSAA default action=$($msaaFallback.DefaultAction))"
        exit 0
      }
    }
  } catch {
    $lastError = $_.Exception.Message
  }
  Start-Sleep -Milliseconds 100
}

if ($null -ne $lastError) {
  throw "Timed out waiting for the packaged migration dialog: $lastError"
}
$targetProcessText = $lastTargetProcessIds -join ','
throw "Timed out waiting for the packaged migration dialog (root=$ProcessId, targetPids=$targetProcessText, topLevel=$lastTopLevelCount, ownerMatches=$lastOwnerMatchCount, titleMatches=$lastDialogCount, descendants=$lastDescendantCount, buttonMatches=$lastButtonCount, msaaFallbackMatches=$lastMsaaFallbackCount, dialogDescendants=$lastDialogDescendants, topLevelWindows=$lastTopLevelWindows)."
