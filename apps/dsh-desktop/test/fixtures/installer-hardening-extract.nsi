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

; Fixture-only observations. Preserve registers used by the stock extraction macro.
Function WriteFixturePhase
  Exch $6
  Push $7
  Push $8
  System::Call 'kernel32::GetTickCount() i .r7'
  FileOpen $8 "$TEMP\fixture-phases.txt" a
  FileSeek $8 0 END
  FileWrite $8 "tickMs=$7 phase=$6$\r$\n"
  FileClose $8
  Pop $8
  Pop $7
  Pop $6
FunctionEnd

!macro FixturePhase PHASE
  Push "${PHASE}"
  Call WriteFixturePhase
!macroend

Function WriteFixtureContext
  Push $6
  Push $7
  Push $8
  Push $9
  FileOpen $9 "$TEMP\fixture-context.txt" w
  System::Call 'kernel32::GetCurrentProcessId() i .r6'
  FileWrite $9 "pid=$6$\r$\n"
  System::Call 'kernel32::ProcessIdToSessionId(i r6, *i .r7) i .r8'
  FileWrite $9 "sessionId=$7 success=$8$\r$\n"
  System::Call 'user32::GetProcessWindowStation() p .r6'
  System::Call 'user32::GetUserObjectInformationW(p r6, i 2, w .r7, i ${NSIS_MAX_STRLEN}, *i .r8) i .r6'
  FileWrite $9 "windowStation=$7 success=$6 bytesNeeded=$8$\r$\n"
  System::Call 'kernel32::GetCurrentThreadId() i .r6'
  FileWrite $9 "threadId=$6$\r$\n"
  System::Call 'user32::GetThreadDesktop(i r6) p .r6'
  System::Call 'user32::GetUserObjectInformationW(p r6, i 2, w .r7, i ${NSIS_MAX_STRLEN}, *i .r8) i .r6'
  FileWrite $9 "desktop=$7 success=$6 bytesNeeded=$8$\r$\n"
  FileClose $9
  Pop $9
  Pop $8
  Pop $7
  Pop $6
FunctionEnd

Section
  Call WriteFixtureContext
  !insertmacro FixturePhase "preflight-start"
  InitPluginsDir
  !insertmacro customCheckAppRunning
  !insertmacro FixturePhase "preflight-completed"
  SetOutPath "$INSTDIR"
  FileOpen $4 "$INSTDIR\collision.txt" w
  FileWrite $4 "locked-new-target"
  FileClose $4
  FileOpen $4 "$TEMP\prepared.txt" w
  FileWrite $4 "old installation staged"
  FileClose $4
  !insertmacro FixturePhase "prepared-written"
  StrCpy $5 0
wait_for_fixture_lock:
  IfFileExists "$TEMP\lock-ready.txt" fixture_lock_ready
  IntOp $5 $5 + 1
  IntCmp $5 200 fixture_lock_timeout
  Sleep 100
  Goto wait_for_fixture_lock
fixture_lock_timeout:
  !insertmacro FixturePhase "lock-wait-timeout"
  SetErrorLevel 2
  Abort
fixture_lock_ready:
  !insertmacro FixturePhase "lock-ready-observed"
  File /oname=$PLUGINSDIR\payload.7z "${TEST_ARCHIVE}"
  SetSilent normal
  !insertmacro FixturePhase "before-extract"
  !insertmacro extractUsing7za "$PLUGINSDIR\payload.7z"
  !insertmacro FixturePhase "after-extract"
  FileOpen $4 "$INSTDIR\unexpected-success.txt" w
  FileWrite $4 "must not reach extraction success"
  FileClose $4
SectionEnd
