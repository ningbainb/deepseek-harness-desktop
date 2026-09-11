Unicode true
RequestExecutionLevel user
Name "DSH isolated installation progress"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_INSTALL}"
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Install"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Uninstall"
!include "MUI2.nsh"
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
!define MUI_CUSTOMFUNCTION_GUIINIT ShowFixtureWindow
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro customHeader

Function ShowFixtureWindow
  ; The test runner has a hidden console; explicitly show this GUI fixture.
  ShowWindow $HWNDPARENT 5
FunctionEnd

Section
  ; UI-only fixture: never run global legacy-process discovery on the host.
  InitPluginsDir
  SetOutPath "$TEMP"
  File /oname=$PLUGINSDIR\installer-progress.ps1 "${BUILD_RESOURCES_DIR}\installer-progress.ps1"
  !insertmacro DshLog "preflight-start" "pending" "UI fixture preparation"
  !insertmacro DshWorkingProgress "1 / 3  准备安装与保护旧版" "正在检查旧进程并准备可恢复的升级备份。"
  !ifndef TEST_NO_OBSERVER
    Call StartInstallerProgressObserver
  !endif
  Sleep 4000
  !insertmacro DshLog "replace-files" "pending" "UI fixture copy"
  !insertmacro DshWorkingProgress "2 / 3  解压并安装文件" "正在处理应用文件。此阶段耗时取决于文件数量和磁盘速度。"
  ; A real blocking child call: the native animation and elapsed label must
  ; keep updating while no NSIS instructions can execute.
  !ifdef TEST_NO_OBSERVER
    Sleep 3000
  !else
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 23"'
    Pop $0
    Pop $1
  !endif
  !ifdef TEST_ABORT
    !insertmacro DshLog "preflight" "36" "UI fixture lock"
    !insertmacro DshStopProgress
    Abort
  !endif
  !insertmacro DshLog "commit-start" "pending" "UI fixture validation"
  !insertmacro DshWorkingProgress "3 / 3  校验并完成安装" "正在校验新版本并提交安装结果，请勿关闭安装程序。"
  Sleep 3000
  !insertmacro DshLog "completed" "0" "UI fixture completed"
  !insertmacro DshStopProgress
SectionEnd
