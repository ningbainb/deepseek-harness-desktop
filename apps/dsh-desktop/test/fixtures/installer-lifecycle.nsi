Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "DSH isolated installer lifecycle test"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_DEFAULT_INSTALL}"
Var perUserInstallationFolder
Var hasPerUserInstallation
Var hasPerMachineInstallation
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Install"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Uninstall"
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
!define APP_EXECUTABLE_FILENAME "DeepSeek Harness Desktop.exe"
!insertmacro customHeader

Function .onInit
  !insertmacro customInit
FunctionEnd

Function CheckOldUninstallerFixture
  !insertmacro customUnInstallCheck
FunctionEnd

Section
  !ifdef TEST_UNWRITABLE_LOG
    ; An existing directory cannot be opened as a log file.
    StrCpy $DshInstallerLogPath "$TEMP"
  !endif
  !insertmacro customCheckAppRunning
  !ifdef TEST_UNINSTALL_FAILURE
    ClearErrors
    StrCpy $R0 41
    Call CheckOldUninstallerFixture
  !endif
  !ifdef TEST_UNINSTALL_LAUNCH_FAILURE
    StrCpy $R0 0
    SetErrors
    Call CheckOldUninstallerFixture
  !endif
  ; Fault injection: neither the early plugin helper nor the stable helper
  ; survives until the next phase. Production macros must re-stage it.
  Delete "$PLUGINSDIR\installer-upgrade-transaction.ps1"
  Delete "${DSH_UPGRADE_HELPER_SCRIPT}"
  SetOutPath "$INSTDIR\resources"
  File /oname=app.asar "${TEST_PAYLOAD}"
  SetOutPath "$INSTDIR"
  File "/oname=DeepSeek Harness Desktop.exe" "${TEST_PAYLOAD}"
  !ifdef TEST_RUNTIME_PAYLOAD
    File /r "${TEST_RUNTIME_PAYLOAD}\*.*"
  !endif
  !ifndef TEST_BAD_MARKER
    SetOutPath "$INSTDIR\resources"
    File /oname=installer-upgrade-v3 "${BUILD_RESOURCES_DIR}\installer-upgrade-v3"
  !endif
  SetOutPath "$INSTDIR"
  !insertmacro customRestoreRuntime
  FileOpen $4 "$INSTDIR\restore-outdir.txt" w
  FileWriteUTF16LE $4 "$OUTDIR"
  FileClose $4
  CreateShortCut "$INSTDIR\isolated-launch.lnk" "$INSTDIR\DeepSeek Harness Desktop.exe"
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "new"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString '$\"$INSTDIR\Uninstall DeepSeek Harness Desktop.exe$\" /currentuser'
  !ifdef TEST_ABORT
    Abort
  !endif
  !insertmacro customInstall
  FileOpen $4 "$INSTDIR\completed.txt" w
  FileWrite $4 "committed"
  FileClose $4
SectionEnd
