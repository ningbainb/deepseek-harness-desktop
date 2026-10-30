Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "DSH isolated native extraction cancellation"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_INSTALL}"
!include "LogicLib.nsh"
!addincludedir "${STOCK_INCLUDE}"
!addplugindir /x86-unicode "${TEST_PLUGIN_DIR}"
!define PRODUCT_NAME "DSH native extraction fixture"
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Install"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Uninstall"
Var perUserInstallationFolder
Var hasPerUserInstallation
Var hasPerMachineInstallation
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
!define APP_EXECUTABLE_FILENAME "DeepSeek Harness Desktop.exe"
!include "${ADAPTED_INSTALLER}"
!insertmacro customHeader
LangString appCannotBeClosed 1033 "Isolated fixture copy failure: cancel to verify recovery"

Section
  InitPluginsDir
  !insertmacro customCheckAppRunning
  SetOutPath "$INSTDIR"
  FileOpen $4 "$INSTDIR\collision.txt" w
  FileWrite $4 "locked-new-target"
  FileClose $4
  FileOpen $4 "$TEMP\prepared.txt" w
  FileWrite $4 "old installation staged"
  FileClose $4
  StrCpy $5 0
wait_for_fixture_lock:
  IfFileExists "$TEMP\lock-ready.txt" fixture_lock_ready
  IntOp $5 $5 + 1
  IntCmp $5 200 fixture_lock_timeout
  Sleep 100
  Goto wait_for_fixture_lock
fixture_lock_timeout:
  SetErrorLevel 2
  Abort
fixture_lock_ready:
  File /oname=$PLUGINSDIR\payload.7z "${TEST_ARCHIVE}"
  SetSilent normal
  !insertmacro extractUsing7za "$PLUGINSDIR\payload.7z"
  FileOpen $4 "$INSTDIR\unexpected-success.txt" w
  FileWrite $4 "must not reach extraction success"
  FileClose $4
SectionEnd
