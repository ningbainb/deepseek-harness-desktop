!macro customCheckAppRunning
  InitPluginsDir
  SetOutPath "$TEMP"
  File /oname=$PLUGINSDIR\cleanup-stale-processes.ps1 "${BUILD_RESOURCES_DIR}\cleanup-stale-processes.ps1"
  File /oname=$PLUGINSDIR\installer-upgrade-transaction.ps1 "${BUILD_RESOURCES_DIR}\installer-upgrade-transaction.ps1"
cleanup_retry:
  !ifdef BUILD_UNINSTALLER
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-stale-processes.ps1" -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
  !else
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-stale-processes.ps1" -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}" -PrepareExistingUpgrade -UpgradeTransactionScript "$PLUGINSDIR\installer-upgrade-transaction.ps1"'
  !endif
  Pop $0
  Pop $1
  StrCmp $0 "0" cleanup_done
  StrCmp $0 "32" cleanup_busy
  StrCmp $0 "34" cleanup_permission
  StrCmp $0 "35" cleanup_protocol
  StrCmp $0 "36" cleanup_locked
  StrCmp $0 "33" cleanup_script_error
  MessageBox MB_ICONSTOP|MB_OK "DeepSeek Harness Desktop 安装检查执行失败（错误码 $0）。安装程序尚未替换文件，请重新下载安装包后重试。$\r$\n$\r$\n$1 / The installation check failed (code $0) before replacing files. Download the installer again and retry." /SD IDOK
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
  MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "旧版进程已退出，但主程序或 app.asar 仍被其他程序占用。请暂停实时扫描或关闭占用程序后重试。$\r$\n$\r$\n$1 / The old app exited, but the executable or app.asar is still locked. Close the locking process and retry." /SD IDCANCEL IDRETRY cleanup_retry
  Abort
cleanup_script_error:
  MessageBox MB_ICONSTOP|MB_OK "安装前检查脚本执行失败。文件尚未被替换，请重新下载安装包后重试。$\r$\n$\r$\n$1 / The preflight script failed before any files were replaced. Download the installer again and retry." /SD IDOK
  Abort
cleanup_done:
!macroend

!macro customInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\installer-upgrade-transaction.ps1" -Mode Commit -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
  Pop $0
  Pop $1
  StrCmp $0 "0" upgrade_commit_done
  MessageBox MB_ICONSTOP|MB_OK "升级事务无法提交（错误码 $0）。安装程序将恢复上一版本。$\r$\n$\r$\n$1 / The upgrade transaction could not commit (code $0). The installer will restore the previous version." /SD IDOK
  Abort
upgrade_commit_done:
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
  Function .onInstFailed
    IfFileExists "$PLUGINSDIR\installer-upgrade-transaction.ps1" 0 upgrade_rollback_done
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\installer-upgrade-transaction.ps1" -Mode Rollback -InstallDirectory "$INSTDIR" -InstallRegistryKey "${INSTALL_REGISTRY_KEY}" -UninstallRegistryKey "${UNINSTALL_REGISTRY_KEY}"'
    Pop $0
    Pop $1
    DetailPrint "$1"
  upgrade_rollback_done:
  FunctionEnd
  !endif
!macroend
