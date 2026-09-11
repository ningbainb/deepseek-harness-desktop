import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BooleanField, PluginSettingsCard, ValueField } from './PluginSettingsCard.tsx'
import {
  booleanField,
  CardForm,
  numberField,
  type CardActions,
  type CardShell,
  type FieldState,
} from './settings-form.ts'

export interface ParticleThemeSettings {
  enabled?: boolean
  density?: number
  opacity?: number
  speed?: number
}

export interface ParticleThemeSettingsCardState extends CardShell {
  enabled: FieldState
  density: FieldState
  opacity: FieldState
  speed: FieldState
}

export interface ParticleThemeSettingsCardFace extends CardActions {
  hooks: { particleThemeSettingsCard: SnapshotStore<ParticleThemeSettingsCardState> }
}

export class ParticleThemeSettingsCardController {
  private readonly form: CardForm<ParticleThemeSettings>
  private readonly store: SnapshotStore<ParticleThemeSettingsCardState>

  constructor(scope: SettingsScope<ParticleThemeSettings>) {
    this.form = new CardForm(scope, [
      booleanField('enabled'),
      numberField('density', { min: 0.35 }),
      numberField('opacity', { min: 0.08 }),
      numberField('speed', { min: 0.4 }),
    ])
    this.store = this.form.bind(() => ({
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      density: this.form.field('density'),
      opacity: this.form.field('opacity'),
      speed: this.form.field('speed'),
    }))
  }

  inject(): ParticleThemeSettingsCardFace {
    return { hooks: { particleThemeSettingsCard: this.store }, ...this.form.actions() }
  }
}

export type ParticleThemeSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'particle-theme'>
  & InjectFace<ParticleThemeSettingsCardFace>

export function ParticleThemeSettingsCard(props: ParticleThemeSettingsCardProps) {
  const { t } = props
  const state = props.useParticleThemeSettingsCard(snapshot => snapshot)
  const common = {
    overriddenLabel: t('settings.overridden'),
    resetLabel: t('settings.reset'),
    invalidLabel: t('settings.invalidNumber'),
    disabled: !state.writable,
  }
  return (
    <PluginSettingsCard
      t={t}
      titleKey="settings.title"
      descriptionKey="settings.description"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <BooleanField
        id="settings-particle-theme-enabled"
        label={t('settings.enabled')}
        hint={t('settings.enabledHint')}
        inheritLabel={t('settings.inherit')}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        {...common}
        {...state.enabled}
        onEdit={text => { props.edit('enabled', text) }}
        onReset={() => { props.resetField('enabled') }}
      />
      <ValueField
        id="settings-particle-theme-density"
        label={t('settings.density')}
        hint={t('settings.densityHint')}
        numeric
        {...common}
        {...state.density}
        onEdit={text => { props.edit('density', text) }}
        onReset={() => { props.resetField('density') }}
      />
      <ValueField
        id="settings-particle-theme-opacity"
        label={t('settings.opacity')}
        hint={t('settings.opacityHint')}
        numeric
        {...common}
        {...state.opacity}
        onEdit={text => { props.edit('opacity', text) }}
        onReset={() => { props.resetField('opacity') }}
      />
      <ValueField
        id="settings-particle-theme-speed"
        label={t('settings.speed')}
        hint={t('settings.speedHint')}
        numeric
        {...common}
        {...state.speed}
        onEdit={text => { props.edit('speed', text) }}
        onReset={() => { props.resetField('speed') }}
      />
    </PluginSettingsCard>
  )
}
