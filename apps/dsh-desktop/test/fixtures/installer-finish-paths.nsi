Unicode true
RequestExecutionLevel user
Name "DSH isolated finish paths display"
OutFile "${TEST_OUTPUT}"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "nsDialogs.nsh"
!define HIDE_RUN_AFTER_FINISH
Var DshInstallerStage
Var DshInstallerCode
Var DshInstallerDetail
!include "${BUILD_RESOURCES_DIR}\installer-finish-paths.nsh"
!define MUI_CUSTOMFUNCTION_GUIINIT ShowFixtureWindow
!insertmacro MUI_PAGE_INSTFILES
!insertmacro customFinishPage
!insertmacro MUI_LANGUAGE "SimpChinese"
Function WriteInstallerDiagnostic
  DetailPrint "$DshInstallerStage $DshInstallerCode $DshInstallerDetail"
  Push $0
  FileOpen $0 "$EXEDIR\finish-paths-lifecycle.log" a
  FileSeek $0 0 END
  FileWrite $0 "diagnostic $DshInstallerStage $DshInstallerCode$\r$\n"
  FileClose $0
  Pop $0
FunctionEnd
Function .onInit
  Push $0
  FileOpen $0 "$EXEDIR\finish-paths-lifecycle.log" a
  FileSeek $0 0 END
  FileWrite $0 "init$\r$\n"
  FileClose $0
  Pop $0
FunctionEnd
Function ShowFixtureWindow
  Push $0
  FileOpen $0 "$EXEDIR\finish-paths-lifecycle.log" a
  FileSeek $0 0 END
  FileWrite $0 "gui-init$\r$\n"
  FileClose $0
  Pop $0
  ; Like the existing progress fixture, make a GUI run explicitly visible even
  ; when its launcher inherited a hidden-console startup state. /S stays silent.
  ShowWindow $HWNDPARENT 5
FunctionEnd
Function .onGUIEnd
  Push $0
  FileOpen $0 "$EXEDIR\finish-paths-lifecycle.log" a
  FileSeek $0 0 END
  FileWrite $0 "gui-end$\r$\n"
  FileClose $0
  Pop $0
FunctionEnd
Section
  ; UI-only: no real installation, registry, Home discovery or application.
  GetFunctionAddress $0 DshReadFinishPaths
  StrCpy $DshFinishPathText "程序目录：$\r$\nD:\fixture program with spaces"
  StrCpy $0 0
long_path_loop:
  StrCpy $DshFinishPathText "$DshFinishPathText\long-path-segment-with-spaces"
  IntOp $0 $0 + 1
  IntCmp $0 25 0 long_path_loop long_path_loop
  StrCpy $DshFinishPathText "$DshFinishPathText$\r$\n$\r$\n数据目录：首次启动时选择（尚未确定）$\r$\n缓存目录：D:\fixture user data\Cache$\r$\n数据缓存：随首次启动确认的目录/cache$\r$\nEND-OF-PATH-EVIDENCE"
  FileOpen $0 "$EXEDIR\finish-paths-lifecycle.log" a
  FileSeek $0 0 END
  FileWrite $0 "section-complete$\r$\n"
  FileClose $0
SectionEnd
