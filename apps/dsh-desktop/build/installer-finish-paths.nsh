!ifndef BUILD_UNINSTALLER
Var DshFinishPathText

Function DshReadFinishPaths
  Push $0
  Push $1
  Push $2
  Push $OUTDIR
  ; Discovery failure never changes the already committed installation result.
  StrCpy $DshFinishPathText "程序目录：$\r$\n$INSTDIR$\r$\n$\r$\n数据与缓存目录：无法确认，请在首次启动时确认。$\r$\n未更改任何数据。"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=installer-paths.ps1 "${BUILD_RESOURCES_DIR}\installer-paths.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\installer-paths.ps1" -InstallDirectory "$INSTDIR" -OutputPath "$PLUGINSDIR\installer-paths.txt"'
  Pop $0
  Pop $1
  StrCpy $DshInstallerStage "storage-path-discovery"
  StrCpy $DshInstallerCode $0
  StrCpy $DshInstallerDetail $1
  Call WriteInstallerDiagnostic
  StrCmp $0 "0" 0 finish_paths_read_done
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\installer-paths.txt" r
  IfErrors finish_paths_read_done
  StrCpy $2 ""
finish_paths_read_line:
  ClearErrors
  FileReadUTF16LE $0 $1
  IfErrors finish_paths_read_close
  StrCpy $2 "$2$1"
  Goto finish_paths_read_line
finish_paths_read_close:
  FileClose $0
  StrCmp $2 "" finish_paths_read_done
  StrCpy $DshFinishPathText $2
finish_paths_read_done:
  Pop $2
  SetOutPath $2
  Pop $2
  Pop $1
  Pop $0
  ClearErrors
FunctionEnd

!macro customFinishPage
  Var DshFinishPathControl
  ; Keep the pinned builder's stock Finish/StartApp behavior, including updates
  ; and the unelevated-user launch. Only the informational text control changes.
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !define MUI_FINISHPAGE_TEXT_LARGE
  !define MUI_FINISHPAGE_TEXT "$DshFinishPathText"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW DshShowFinishPaths
  !insertmacro MUI_PAGE_FINISH
Function DshShowFinishPaths
  ; The stock label is too short for long paths. Reuse its exact rectangle so
  ; the title, run checkbox and Finish button keep their original layout.
  nsDialogs::CreateControl EDIT ${WS_CHILD}|${WS_VISIBLE}|${WS_TABSTOP}|${WS_VSCROLL}|${WS_HSCROLL}|${ES_MULTILINE}|${ES_READONLY}|${ES_AUTOVSCROLL}|${ES_AUTOHSCROLL} ${WS_EX_CLIENTEDGE} 0 0 1 1 "$DshFinishPathText"
  Pop $DshFinishPathControl
  StrCmp $DshFinishPathControl "error" finish_paths_display_failed
  StrCmp $DshFinishPathControl 0 finish_paths_display_failed
  System::Call '*(i 0, i 0, i 0, i 0) p .r0'
  StrCmp $0 0 finish_paths_display_failed
  System::Call 'user32::GetWindowRect(p $mui.FinishPage.Text , p r0) i .r1'
  StrCmp $1 0 finish_paths_display_free_failed
  System::Call 'user32::MapWindowPoints(p 0, p $mui.FinishPage , p r0, i 2)'
  System::Call '*$0(i .r1, i .r2, i .r3, i .r4)'
  System::Free $0
  IntOp $3 $3 - $1
  IntOp $4 $4 - $2
  System::Call 'user32::MoveWindow(p $DshFinishPathControl , i r1, i r2, i r3, i r4, i 1) i .r0'
  StrCmp $0 0 finish_paths_display_failed
  SendMessage $mui.FinishPage.Text ${WM_GETFONT} 0 0 $0
  SendMessage $DshFinishPathControl ${WM_SETFONT} $0 1
  SendMessage $DshFinishPathControl ${EM_SETLIMITTEXT} 32767 0
  ShowWindow $mui.FinishPage.Text 0
  Return
finish_paths_display_free_failed:
  System::Free $0
finish_paths_display_failed:
  ShowWindow $DshFinishPathControl 0
  StrCpy $DshInstallerStage "storage-path-display"
  StrCpy $DshInstallerCode "unavailable"
  StrCpy $DshInstallerDetail "Scrollable path control unavailable; stock Finish remains available"
  Call WriteInstallerDiagnostic
  ClearErrors
FunctionEnd
!macroend
!endif
