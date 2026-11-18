Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "DSH isolated external browser runtime transaction"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_INSTALL}"
Var perUserInstallationFolder
Var hasPerUserInstallation
Var hasPerMachineInstallation
Var installMode
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Install"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\Uninstall"
!define DSH_LEGACY_INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\LegacyInstall"
!define DSH_LEGACY_UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\LegacyUninstall"
!ifdef DSH_TARGET_PAYLOAD_STAGE
!addplugindir /x86-unicode "${TEST_PLUGIN_DIR}"
!endif
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
!define APP_EXECUTABLE_FILENAME "DeepSeek Harness Desktop.exe"
!insertmacro customHeader
Function .onInit
  StrCpy $installMode "CurrentUser"
  !insertmacro customInit
FunctionEnd
Section
  ; Deliberately exercise extraction/restore/commit callbacks only. This fixture
  ; never invokes product-wide process cleanup, startup, or browser preparation.
  InitPluginsDir
  IfSilent +2 0
  Call StartInstallerProgressObserver
  SetOutPath "$INSTDIR"
  !ifdef DSH_TARGET_PAYLOAD_STAGE
  !insertmacro DshExtractTargetVolumePayload
  !else
  File /r "${TEST_RUNTIME_PAYLOAD}\*.*"
  SetOutPath "$INSTDIR\resources"
  File /oname=installer-upgrade-v3 "${BUILD_RESOURCES_DIR}\installer-upgrade-v3"
  !endif
  SetOutPath "$INSTDIR"
  !insertmacro customRestoreRuntime
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "new"
  !insertmacro customInstall
  FileOpen $4 "$INSTDIR\completed.txt" w
  FileWrite $4 "committed"
  FileClose $4
SectionEnd
