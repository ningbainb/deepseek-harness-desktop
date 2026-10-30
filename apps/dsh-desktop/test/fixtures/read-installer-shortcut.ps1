param([Parameter(Mandatory=$true)][string] $ShortcutPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not [IO.File]::Exists($ShortcutPath)) { throw 'Installer shortcut is missing' }
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
namespace DshInstallerShortcut {
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int capacity, IntPtr findData, uint flags);
    void GetIDList(out IntPtr itemList);
    void SetIDList(IntPtr itemList);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int capacity);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int capacity);
  }
  public sealed class Readback {
    public string workingDirectory { get; set; }
    public string targetPath { get; set; }
  }
  public static class Reader {
    public static Readback Read(string path) {
      object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
      try {
        ((IPersistFile)instance).Load(path, 0);
        var link = (IShellLinkW)instance;
        var working = new StringBuilder(32768);
        var target = new StringBuilder(32768);
        link.GetWorkingDirectory(working, working.Capacity);
        link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
        return new Readback { workingDirectory=working.ToString(), targetPath=target.ToString() };
      } finally { Marshal.FinalReleaseComObject(instance); }
    }
  }
}
'@
$native = [DshInstallerShortcut.Reader]::Read($ShortcutPath)
$legacy = @{}
$shell = $null
$link = $null
try {
  $shell = [Activator]::CreateInstance([Type]::GetTypeFromProgID('WScript.Shell'))
  $link = $shell.CreateShortcut($ShortcutPath)
  $legacy = @{ workingDirectory=$link.WorkingDirectory; targetPath=$link.TargetPath }
} catch { $legacy = @{ error=$_.Exception.Message } }
finally {
  if ($null -ne $link) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
  if ($null -ne $shell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
[Console]::Write((@{
  path=$ShortcutPath; exists=[IO.File]::Exists($ShortcutPath)
  workingDirectory=$native.workingDirectory; targetPath=$native.targetPath
  loader='IShellLinkW/IPersistFile.Load'; legacyWScript=$legacy
  systemLocale=(Get-WinSystemLocale).Name
} | ConvertTo-Json -Depth 4 -Compress))
