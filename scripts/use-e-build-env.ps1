param(
  [ValidateSet('test', 'package')][string]$Mode = 'test'
)

# Compatibility entry point for existing E: worktrees.
. (Join-Path $PSScriptRoot 'use-build-env.ps1') -Mode $Mode -BuildRoot 'E:\DeepSeekHarnessDesktop-Build'
