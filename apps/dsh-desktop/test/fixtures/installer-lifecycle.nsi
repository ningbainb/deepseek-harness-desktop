Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "DSH isolated installer lifecycle test"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_INSTALL}"
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Install"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Uninstall"
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
!insertmacro customHeader

Section
  !insertmacro customCheckAppRunning
  ; Fault injection: neither the early plugin helper nor the stable helper
  ; survives until the next phase. Production macros must re-stage it.
  Delete "$PLUGINSDIR\installer-upgrade-transaction.ps1"
  Delete "${DSH_UPGRADE_HELPER_SCRIPT}"
  SetOutPath "$INSTDIR\resources"
  File /oname=app.asar "${TEST_PAYLOAD}"
  SetOutPath "$INSTDIR"
  File "/oname=DeepSeek Harness Desktop.exe" "${TEST_PAYLOAD}"
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "new"
  !ifdef TEST_ABORT
    Abort
  !endif
  !ifndef TEST_BAD_MARKER
    SetOutPath "$INSTDIR\resources"
    File /oname=installer-upgrade-v3 "${BUILD_RESOURCES_DIR}\installer-upgrade-v3"
  !endif
  !insertmacro customInstall
  FileOpen $4 "$INSTDIR\completed.txt" w
  FileWrite $4 "committed"
  FileClose $4
SectionEnd
