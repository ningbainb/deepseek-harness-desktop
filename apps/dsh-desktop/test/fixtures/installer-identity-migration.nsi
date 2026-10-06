Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "DSH installer identity migration test"
OutFile "${TEST_OUTPUT}"
InstallDir "${TEST_FRESH_INSTALL}"

!define APP_EXECUTABLE_FILENAME "DeepSeek Harness Desktop.exe"
!define DSH_LEGACY_APP_GUID "test-legacy"
!define DSH_LEGACY_INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\LegacyInstall"
!define DSH_LEGACY_UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\LegacyUninstall"
!define INSTALL_REGISTRY_KEY "${TEST_REGISTRY}\CurrentInstall"
!define UNINSTALL_REGISTRY_KEY "${TEST_REGISTRY}\CurrentUninstall"

Var perUserInstallationFolder
Var hasPerUserInstallation
Var hasPerMachineInstallation

!include "${BUILD_RESOURCES_DIR}\installer.nsh"

Section
  SetRegView 64
  !insertmacro customInit
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\selected-install.txt" w
  FileWriteUTF16LE $0 "$INSTDIR"
  FileClose $0
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  Call RetireLegacyInstallerIdentity
SectionEnd
