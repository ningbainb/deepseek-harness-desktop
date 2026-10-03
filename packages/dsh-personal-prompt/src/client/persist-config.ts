import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PersonalPromptConfig } from '../core/config.ts'

export function persistPersonalPromptConfig(
  form: Pick<ConfigForm<PersonalPromptConfig>, 'mutate'>,
  config: PersonalPromptConfig,
  revision?: number,
): Promise<boolean> {
  const profiles = config.profiles.map(profile => {
    const value: Record<string, string | number | boolean> = {
      id: profile.id, name: profile.name, content: profile.content,
      enabled: profile.enabled, scope: profile.scope, updatedAt: profile.updatedAt,
    }
    if (profile.workspaceId !== undefined) value.workspaceId = profile.workspaceId
    if (profile.sessionId !== undefined) value.sessionId = profile.sessionId
    return value
  })
  return form.mutate([
    { op: 'set', path: ['profiles'], value: profiles },
    { op: 'set', path: ['enabled'], value: config.enabled },
    config.activeProfileId === undefined
      ? { op: 'unset', path: ['activeProfileId'] }
      : { op: 'set', path: ['activeProfileId'], value: config.activeProfileId },
  ], revision)
}
