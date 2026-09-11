!define DSH_UPGRADE_HELPER_DIR "$TEMP\dsh-desktop-installer-support"
!define DSH_UPGRADE_HELPER_SCRIPT "${DSH_UPGRADE_HELPER_DIR}\installer-upgrade-transaction.ps1"

!ifndef BUILD_UNINSTALLER
Function StageUpgradeTransactionScript
  CreateDirectory "${DSH_UPGRADE_HELPER_DIR}"
  SetOutPath "${DSH_UPGRADE_HELPER_DIR}"
  SetOverwrite on
  File /oname=installer-upgrade-transaction.ps1 "${BUILD_RESOURCES_DIR}\installer-upgrade-transaction.ps1"
FunctionEnd

Function RemoveUpgradeTransactionScript
  Delete "${DSH_UPGRADE_HELPER_SCRIPT}"
  RMDir "${DSH_UPGRADE_HELPER_DIR}"
FunctionEnd
!endif

!macro customCheckAppRunning
  InitPluginsDir
  SetOutPath "$TEMP"
  File /oname=$PLUGINSDIR\cleanup-stale-processes.ps1 "${BUILD_RESOURCES_DIR}\cleanup-stale-processes.ps1"
cleanup_retry:
  !ifdef BUILD_UNINSTALLER
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-stale-processes.ps1" -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
  !else
  Call StageUpgradeTransactionScript
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-stale-processes.ps1" -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}" -PrepareExistingUpgrade -UpgradeTransactionScript "${DSH_UPGRADE_HELPER_SCRIPT}"'
  !endif
  Pop $0
  Pop $1
  StrCmp $0 "0" cleanup_done
  StrCmp $0 "32" cleanup_busy
  StrCmp $0 "34" cleanup_permission
  StrCmp $0 "35" cleanup_protocol
  StrCmp $0 "36" cleanup_locked
  StrCmp $0 "33" cleanup_script_error
  MessageBox MB_ICONSTOP|MB_OK "DeepSeek Harness Desktop 安装检查执行失败（错误码 $0），已停止继续安装。请保留安装目录和升级备份，重启电脑后重试；如仍失败，请反馈下方详情。$\r$\n$\r$\n$1 / The installation check failed (code $0) and setup stopped. Keep the install and upgrade backups intact, restart Windows and retry, or report these details." /SD IDOK
  Abort
cleanup_busy:
  MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "DeepSeek Harness Desktop 的旧进程仍在运行。请根据下方 PID 关闭它后重试。$\r$\n$\r$\n$1 / Previous-install PIDs are still running. Close the listed processes and retry." /SD IDCANCEL IDRETRY cleanup_retry
  Abort
cleanup_permission:
  MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "安装程序没有权限关闭旧进程或替换旧文件。请关闭以管理员身份运行的旧版，或用相同权限重新运行安装程序。$\r$\n$\r$\n$1 / Permission was denied while closing the old app or opening its files. Close an elevated instance or rerun with matching permissions." /SD IDCANCEL IDRETRY cleanup_retry
  Abort
cleanup_protocol:
  MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "旧版未在限时内交付有效的安全关机回执，兼容清理后仍有进程残留。请关闭下方进程后重试。$\r$\n$\r$\n$1 / The old app did not deliver a valid shutdown receipt in time and processes remain after fallback cleanup. Close them and retry." /SD IDCANCEL IDRETRY cleanup_retry
  Abort
cleanup_locked:
  MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "旧版进程已退出，但主程序或 app.asar 仍被其他程序占用。请关闭占用程序，或重启电脑后重试。$\r$\n$\r$\n$1 / The old app exited, but the executable or app.asar is still locked. Close the locking process or restart Windows and retry." /SD IDCANCEL IDRETRY cleanup_retry
  Abort
cleanup_script_error:
  MessageBox MB_ICONSTOP|MB_OK "安装准备未完成，已停止继续安装。请勿手动删除安装目录或升级备份；关闭程序或重启电脑后重试。如仍失败，请将下方错误信息反馈给开发者。$\r$\n$\r$\n$1 / Installation preparation failed and setup stopped. Keep the install and upgrade backups intact. Close the app or restart Windows and retry; report the details below if it persists." /SD IDOK
  Abort
cleanup_done:
!macroend

!macro customInstall
  Call StageUpgradeTransactionScript
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${DSH_UPGRADE_HELPER_SCRIPT}" -Mode Commit -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
  Pop $0
  Pop $1
  StrCmp $0 "0" upgrade_commit_done
  StrCpy $2 $0
  StrCpy $3 $1
  DetailPrint "Upgrade transaction commit failed with code $2: $3"
  Call StageUpgradeTransactionScript
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${DSH_UPGRADE_HELPER_SCRIPT}" -Mode Rollback -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
  Pop $0
  Pop $1
  DetailPrint "Upgrade transaction rollback finished with code $0: $1"
  StrCmp $0 "0" upgrade_commit_rolled_back
  MessageBox MB_ICONSTOP|MB_OK "升级事务提交失败（错误码 $2），自动恢复也失败（错误码 $0）。旧版备份已保留，请不要卸载或删除安装目录，并联系维护者处理。$\r$\n$\r$\nThe upgrade commit failed (code $2), and automatic recovery also failed (code $0). The previous-version backup was retained. Do not uninstall or delete the installation directory; contact the maintainer." /SD IDOK
  Abort
upgrade_commit_rolled_back:
  Call RemoveUpgradeTransactionScript
  MessageBox MB_ICONSTOP|MB_OK "升级事务提交失败（错误码 $2），上一版本已恢复。请将错误码反馈给开发者，确认原因后再重试。$\r$\n$\r$\nThe upgrade commit failed (code $2), and the previous version was restored. Report this code to the maintainer before retrying." /SD IDOK
  Abort
upgrade_commit_done:
  Call RemoveUpgradeTransactionScript
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
  Function .onInstFailed
    Call StageUpgradeTransactionScript
    IfFileExists "${DSH_UPGRADE_HELPER_SCRIPT}" 0 upgrade_rollback_helper_missing
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${DSH_UPGRADE_HELPER_SCRIPT}" -Mode Rollback -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
    Pop $0
    Pop $1
    DetailPrint "Upgrade transaction failure callback finished with code $0: $1"
    StrCmp $0 "0" 0 upgrade_rollback_done
    Call RemoveUpgradeTransactionScript
    Goto upgrade_rollback_done
  upgrade_rollback_helper_missing:
    DetailPrint "Upgrade transaction failure callback could not stage its recovery helper."
  upgrade_rollback_done:
  FunctionEnd
  !endif
!macroend
