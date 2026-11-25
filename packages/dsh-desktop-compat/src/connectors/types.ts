export const CONNECTOR_API_PREFIX = '/api/dsh-connectors'
export const WORK_OFFICE_PRESET_ID = 'work-office'

export type ConnectorStatus =
  | 'not_installed'
  | 'installed_unauthenticated'
  | 'awaiting_admin_approval'
  | 'connected'
  | 'error'
  | 'auth_expired'
  | 'incompatible'
  | 'update_available'
  | 'disabled'

export type ConnectorRiskLevel = 'L0' | 'L1' | 'L2' | 'L3'

export type ConnectorCategory =
  | 'office-suite'
  | 'meeting-docs'
  | 'knowledge-notes'
  | 'storage-mail'
  | 'dev-collab'
  | 'other'

export interface LocalizedText {
  zh: string
  en: string
}

export interface LocalizedSteps {
  zh: string[]
  en: string[]
}

export interface ConnectorInstallSource {
  kind: 'npm' | 'github-release' | 'pypi-uvx'
  package?: string
  repo?: string
  versionRange?: string
  assetTemplates?: Record<string, string>
  checksumAsset?: string
}

export interface ConnectorDriverCli {
  kind: 'cli'
  id: string
  binary: string
  installSource: ConnectorInstallSource
  versionArgs?: string[]
  skillsSource?: {
    kind: 'bundled-in-package' | 'release-asset' | 'repo-path'
    assetName?: string
    repo?: string
    path?: string
  }
}

export interface ConnectorDriverMcpRemote {
  kind: 'mcp-remote'
  id: string
  url: string
  remoteTransport: 'streamable-http' | 'sse-legacy'
  toolLoading?: 'on-demand' | 'eager'
  allowedTools?: string[]
  headersTemplate?: Record<string, string>
  oauth?: {
    issuer?: string
    scopes?: string[]
  }
}

export interface ConnectorDriverMcpStdio {
  kind: 'mcp-stdio'
  id: string
  command: string
  args: string[]
  installSource?: ConnectorInstallSource
  envTemplate?: Record<string, string>
  toolLoading?: 'on-demand' | 'eager'
  allowedTools?: string[]
}

export interface ConnectorDriverSkill {
  kind: 'skill'
  id: string
  skillName: string
  source: {
    kind: 'github-repo' | 'npm' | 'builtin'
    ref: string
  }
}

export type ConnectorDriverSpec =
  | ConnectorDriverCli
  | ConnectorDriverMcpRemote
  | ConnectorDriverMcpStdio
  | ConnectorDriverSkill

export interface ConnectorCredentialField {
  key: string
  label: LocalizedText
  fieldType: 'text' | 'password' | 'url'
  required: boolean
  secret: boolean
  placeholder?: LocalizedText
  help?: LocalizedText
}

export interface ConnectorRiskRule {
  actionPattern: string
  level: ConnectorRiskLevel
  label?: LocalizedText
}

export interface ConnectorExample {
  title: LocalizedText
  prompt: LocalizedText
}

export interface ConnectorTroubleshootingRule {
  code: string
  matchPattern: string
  cause: LocalizedText
  fix: LocalizedText
}

export interface ConnectorCatalogEntry {
  id: string
  name: LocalizedText
  summary: LocalizedText
  category: ConnectorCategory
  icon: string
  color: string
  maintainer: 'official' | 'community'
  platforms: Array<'win32' | 'darwin' | 'linux'>
  minDesktopVersion: string
  officialUrls: {
    repo?: string
    docs: string
    openPlatform?: string
  }
  drivers: ConnectorDriverSpec[]
  auth: {
    mode: 'cli-native' | 'oauth2' | 'personal-token' | 'api-key' | 'custom-fields'
    quickAuthUrl?: string
    manualUrl?: string
    guideSteps: LocalizedSteps
    requiresEnterpriseAdmin?: boolean
    paidTierNote?: LocalizedText
    cliLoginCommand?: string[]
    fields?: ConnectorCredentialField[]
  }
  healthCheck: {
    kind: 'cli-command' | 'mcp-probe' | 'skill-present'
    args?: string[]
    timeoutMs?: number
  }
  riskRules: ConnectorRiskRule[]
  examples: ConnectorExample[]
  troubleshooting: ConnectorTroubleshootingRule[]
  deprecated?: {
    reason: LocalizedText
    replacementId?: string
  }
}

export interface ConnectorCatalogDocument {
  schemaVersion: 1
  catalogVersion: string
  updatedAt: string
  connectors: ConnectorCatalogEntry[]
}

export interface ConnectorProfileConfig {
  id: string
  label?: string
  nonSecretFields?: Record<string, string>
  accountLabel?: string
}

export interface ConnectorUserConfig {
  enabled: boolean
  selectedDriverId?: string
  customBinaryPath?: string
  activeProfileId: string
  profiles: Record<string, ConnectorProfileConfig>
  consentAccepted?: boolean
  pinnedVersion?: string
}

export interface ConnectorPersistedConfigFile {
  version: 1
  connectors: Record<string, ConnectorUserConfig>
}

export interface ConnectorEnvironmentDiagnostic {
  installed: boolean
  driverId: string
  driverKind: ConnectorDriverSpec['kind']
  binaryPath?: string
  version?: string
  note?: string
}

export interface ConnectorDiagnosticResult {
  status: ConnectorStatus
  checkedAt: string
  friendlyCause?: LocalizedText
  friendlyFix?: LocalizedText
  rawError?: string
  environment?: ConnectorEnvironmentDiagnostic
}

export interface ConnectorRuntimeItem {
  entry: ConnectorCatalogEntry
  config: ConnectorUserConfig
  status: ConnectorStatus
  activeDriver: ConnectorDriverSpec
  diagnostic?: ConnectorDiagnosticResult
  hasSecrets?: Record<string, boolean>
}

export interface ConnectorInstallResult {
  ok: boolean
  skipped?: boolean
  installed: boolean
  binaryPath?: string
  version?: string
  sourceUsed?: string
  fallbackUrl?: string
  friendlyError?: LocalizedText
  rawError?: string
}

export interface ConnectorLoginSession {
  connectorId: string
  kind: 'web-token' | 'cli-browser'
  state: 'awaiting_user' | 'pending' | 'succeeded' | 'failed'
  authUrl?: string
  deviceCode?: string
  fallbackUrl?: string
  needsTokenInput?: boolean
  message?: LocalizedText
  rawOutput?: string
}

export interface ConnectorStateSnapshot {
  catalogVersion: string
  workOfficePresetId: string
  connectedCount: number
  items: ConnectorRuntimeItem[]
}

export interface ConnectorRiskMatch {
  connectorId: string
  level: ConnectorRiskLevel
  label?: LocalizedText
}
