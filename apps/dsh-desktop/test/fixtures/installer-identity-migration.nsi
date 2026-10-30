Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "DSH installer identity migration test"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_FRESH_INSTALL}"

!define DSH_LEGACY_APP_GUID "test-legacy"
!define DSH_LEGACY_INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\LegacyInstall"
!define DSH_LEGACY_UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\LegacyUninstall"
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\CurrentInstall"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\CurrentUninstall"

Var perUserInstallationFolder
Var hasPerUserInstallation
Var hasPerMachineInstallation

!include "${BUILD_RESOURCES_DIR}\installer.nsh"
!define APP_EXECUTABLE_FILENAME "DeepSeek Harness Desktop.exe"
!ifdef TEST_MODE_RESET
  Var installMode
  ; Advertise the same stock hook boundary; simulate its registry-only reset below.
  !macro setInstallModePerUser
  !macroend
  !insertmacro customHeader
!endif

Section
  SetRegView 64
  !insertmacro customInit
  !ifdef TEST_MODE_RESET
    !ifmacrodef customInstallMode
      !insertmacro customInstallMode
    !endif
    StrCpy $installMode "CurrentUser"
    StrCpy $INSTDIR "${TEST_FRESH_INSTALL}"
    !ifmacrodef customInstallMode
      Call DshRestoreModeDirectory
    !endif
  !endif
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\selected-install.txt" w
  FileWriteUTF16LE $0 "$INSTDIR"
  FileClose $0
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  Call RetireLegacyInstallerIdentity
SectionEnd
