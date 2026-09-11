!ifndef BUILD_UNINSTALLER
Var DshProgressBar
Var DshProgressStarted

Function SetInstallerWorkingProgress
  Push $8
  Push $9
  IfSilent progress_working_done
  FindWindow $8 "#32770" "" $HWNDPARENT
  GetDlgItem $DshProgressBar $8 1004
  StrCmp $DshProgressBar 0 progress_working_done
  ; PBS_MARQUEE: activity, not an invented percentage. Windows animates this
  ; on the UI thread while the install worker is blocked in file operations.
  System::Call 'user32::GetWindowLong(p $DshProgressBar, i -16) i .r9'
  IntOp $9 $9 | 0x8
  System::Call 'user32::SetWindowLong(p $DshProgressBar, i -16, i r9)'
  SendMessage $DshProgressBar 0x40a 1 35
progress_working_done:
  Pop $9
  Pop $8
FunctionEnd

Function StopInstallerWorkingProgress
  Push $9
  StrCmp $DshProgressBar "" progress_stop_done
  StrCmp $DshProgressBar 0 progress_stop_done
  SendMessage $DshProgressBar 0x40a 0 0
  System::Call 'user32::GetWindowLong(p $DshProgressBar, i -16) i .r9'
  IntOp $9 $9 & 0xfffffff7
  System::Call 'user32::SetWindowLong(p $DshProgressBar, i -16, i r9)'
progress_stop_done:
  Pop $9
FunctionEnd

Function StartInstallerProgressObserver
  IfSilent progress_observer_done
  StrCmp $DshProgressStarted "1" progress_observer_done
  StrCpy $DshProgressStarted "1"
  Push $8
  System::Call 'kernel32::GetCurrentProcessId() i .r8'
  ; SW_HIDE plus -WindowStyle Hidden: no console flashing during setup.
  ExecShell "" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\installer-progress.ps1" -InstallerPid $8 -WindowHandle $HWNDPARENT -ProgressLogPath "$DshInstallerLogPath"' SW_HIDE
  Pop $8
  ClearErrors
progress_observer_done:
FunctionEnd
!endif

!macro DshWorkingProgress TITLE DESCRIPTION
  !ifndef BUILD_UNINSTALLER
    Push $8
    GetDlgItem $8 $HWNDPARENT 1037
    SendMessage $8 0x0c 0 'STR:${TITLE}'
    GetDlgItem $8 $HWNDPARENT 1038
    SendMessage $8 0x0c 0 'STR:${DESCRIPTION}'
    Call SetInstallerWorkingProgress
    Pop $8
  !endif
!macroend

!macro DshStopProgress
  !ifndef BUILD_UNINSTALLER
    Call StopInstallerWorkingProgress
  !endif
!macroend
