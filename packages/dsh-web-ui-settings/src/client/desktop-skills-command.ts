import type { Context } from '@deepseek-ai/cordis'
import type {} from '@linxin666/dsh-client-ui-model-preferences/client'

export const DESKTOP_SKILLS_COMMAND = 'desktop-skills-library'

type CommandContribution = Parameters<Context['commandUi']['register']>[0]
type SkillsHost = Window & { dshDesktop?: { listSkills?: unknown } }

export function installDesktopSkillsCommand(ctx: Context, doc: Document): () => void {
  if (typeof (doc.defaultView as SkillsHost | null)?.dshDesktop?.listSkills !== 'function') return () => {}
  const translate = ctx.locale.bind('web-ui-plugins')
  let disposed = false
  let failure: HTMLElement | undefined
  const reportFailure = () => {
    if (!failure) {
      failure = doc.createElement('div')
      failure.dataset.dshSkillsCommandError = ''
      failure.setAttribute('role', 'alert')
    }
    failure.textContent = translate('skillsCommandOpenFailed')
    const composer = doc.querySelector('[data-composer-card]')
    ;(composer ?? doc.body).append(failure)
  }
  const contribution: CommandContribution = {
    name: DESKTOP_SKILLS_COMMAND,
    label: () => translate('skillsCommandLabel'),
    description: () => translate('skillsCommandDescription'),
    available: () => true,
    ui: {
      kind: 'action',
      run: () => {
        queueMicrotask(() => {
          if (disposed) return
          failure?.remove()
          failure = undefined
          const host = doc.defaultView as SkillsHost | null
          const button = doc.querySelector<HTMLButtonElement>('[data-composer-card] .dsh-desktop-skills-button[aria-controls="dsh-desktop-skills-menu"]')
          if (typeof host?.dshDesktop?.listSkills !== 'function' || !button || button.disabled || button.closest('[hidden]')) {
            reportFailure()
            return
          }
          try {
            if (button.getAttribute('aria-expanded') !== 'true') button.click()
            const menu = doc.getElementById('dsh-desktop-skills-menu')
            if (button.getAttribute('aria-expanded') !== 'true' || !menu || menu.hidden) reportFailure()
          } catch { reportFailure() }
        })
      },
    },
  }
  const command = ctx.get?.('commandUi')
  const unregister = command?.register(contribution)
  if (!command) reportFailure()
  return () => {
    if (disposed) return
    disposed = true
    unregister?.()
    failure?.remove()
  }
}
