$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class DshConsoleEvents {
  public class Entry { public uint pid; public long window; public string kind; public List<int> ancestors; }
  [StructLayout(LayoutKind.Sequential)] struct BasicInfo {
    public IntPtr reserved1, peb, reserved2, reserved3, pid, parent;
  }
  [StructLayout(LayoutKind.Sequential)] struct Message {
    public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam;
    public uint time; public int x, y; public uint privateValue;
  }
  delegate void EventProc(IntPtr hook, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, EventProc callback, uint pid, uint thread, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int size);
  [DllImport("user32.dll")] static extern bool PeekMessage(out Message msg, IntPtr hwnd, uint min, uint max, uint remove);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message msg);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int type, out BasicInfo info, int size, out int returned);
  static EventProc callback = OnEvent;
  static IntPtr hook;
  public static List<Entry> Entries = new List<Entry>();
  public static int Dropped;
  public static int Seen;
  public static volatile bool StopRequested;
  public static void Start() {
    // EVENT_OBJECT_SHOW captures even a console that disappears before the next poll.
    hook = SetWinEventHook(0x8002, 0x8002, IntPtr.Zero, callback, 0, 0, 0);
    if (hook == IntPtr.Zero) throw new Exception("console event hook unavailable");
    System.Threading.Tasks.Task.Run(() => { Console.ReadLine(); StopRequested = true; });
  }
  static void OnEvent(IntPtr hookId, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time) {
    Seen++;
    if (hwnd == IntPtr.Zero) return;
    var name = new StringBuilder(256);
    GetClassName(hwnd, name, name.Capacity);
    string kind = name.ToString();
    if (obj != 0 || child != 0) return;
    if (kind != "ConsoleWindowClass" && kind != "CASCADIA_HOSTING_WINDOW_CLASS" && kind != "PseudoConsoleWindow") return;
    uint pid; GetWindowThreadProcessId(hwnd, out pid);
    var ancestors = new List<int>();
    int current = (int)pid;
    for (int depth = 0; depth < 24 && current > 0 && !ancestors.Contains(current); depth++) {
      ancestors.Add(current);
      try {
        using (var process = Process.GetProcessById(current)) {
          BasicInfo info; int length;
          if (NtQueryInformationProcess(process.Handle, 0, out info, Marshal.SizeOf(typeof(BasicInfo)), out length) != 0) break;
          current = info.parent.ToInt32();
        }
      } catch { break; }
    }
    if (Entries.Count < 256) Entries.Add(new Entry { pid = pid, window = hwnd.ToInt64(), kind = kind, ancestors = ancestors });
    else Dropped++;
  }
  public static void Pump() {
    Message msg;
    while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref msg); DispatchMessage(ref msg); }
  }
  public static void Stop() { if (hook != IntPtr.Zero) UnhookWinEvent(hook); }
  public static void Observe() {
    Start();
    try {
      Console.Out.WriteLine("DSH_CONSOLE_OBSERVER_READY");
      var deadline = DateTime.UtcNow.AddSeconds(180);
      while (!StopRequested && DateTime.UtcNow < deadline) { Pump(); System.Threading.Thread.Sleep(10); }
      Pump();
    } finally { Stop(); }
  }
}
'@
$started = [DateTime]::UtcNow
[DshConsoleEvents]::Observe()
[PSCustomObject]@{ events = @([DshConsoleEvents]::Entries.ToArray()); dropped = [DshConsoleEvents]::Dropped; seen = [DshConsoleEvents]::Seen; timedOut = -not [DshConsoleEvents]::StopRequested; elapsed = ([DateTime]::UtcNow - $started).TotalMilliseconds } | ConvertTo-Json -Compress -Depth 5
