import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_SKILLS_COMMAND, installDesktopSkillsCommand } from '../src/client/desktop-skills-command.ts'
import type { Context } from '@deepseek-ai/cordis'
import { zh, en, type WebUIPluginsKey } from '../src/client/locales.ts'

type Contribution = Parameters<Context['commandUi']['register']>[0]
let dispose: (() => void) | undefined

function fixture() {
  const bridge = vi.fn()
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: { listSkills: bridge } })
  document.body.innerHTML = '<div data-composer-card="true"><button aria-label="添加文件或调用指令">+</button><input type="file" hidden><button class="dsh-desktop-skills-button" aria-controls="dsh-desktop-skills-menu" aria-expanded="false">技能库</button></div><section id="dsh-desktop-skills-menu" role="dialog" hidden>same skill list</section>'
  const originalCommands = [{ name: 'model' }, { name: 'files' }]
  const entries: Array<Contribution | { name: string }> = [...originalCommands]
  const unregister = vi.fn(() => { entries.splice(entries.findIndex(entry => entry.name === DESKTOP_SKILLS_COMMAND), 1) })
  const register = vi.fn((entry: Contribution) => { entries.push(entry); return unregister })
  const get = vi.fn((service: string) => { expect(service).toBe('commandUi'); return { register } })
  const locale = { bind: () => (key: WebUIPluginsKey) => (document.documentElement.lang.startsWith('en') ? en : zh)[key] }
  dispose = installDesktopSkillsCommand({ get, locale } as unknown as Context, document)
  const contribution = register.mock.calls[0]![0]
  const button = document.querySelector<HTMLButtonElement>('.dsh-desktop-skills-button')!
  const menu = document.getElementById('dsh-desktop-skills-menu')!
  const clicked = vi.fn(() => { button.setAttribute('aria-expanded', 'true'); menu.hidden = false })
  button.addEventListener('click', clicked)
  const run = () => {
    expect(contribution.ui.kind).toBe('action')
    if (contribution.ui.kind === 'action') contribution.ui.run({ sessionId: 'test-session' } as never)
  }
  return { entries, originalCommands, contribution, button, menu, clicked, bridge, unregister, run }
}

afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); document.documentElement.lang = ''; Reflect.deleteProperty(window, 'dshDesktop'); vi.restoreAllMocks() })

it('leaves ordinary browser command registration unchanged without the Desktop bridge', () => {
  Reflect.deleteProperty(window, 'dshDesktop')
  const get = vi.fn()
  dispose = installDesktopSkillsCommand({ get } as unknown as Context, document)
  expect(get).not.toHaveBeenCalled()
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

it('uses the registered English dictionary for the label and visible failure', async () => {
  document.documentElement.lang = 'en'
  const state = fixture()
  expect(state.contribution.label?.()).toBe('Skill library')
  state.button.remove()
  state.run()
  await Promise.resolve()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not open the skill library')
})

it('adds only its action while retaining existing commands and file controls', () => {
  const state = fixture()
  expect(state.entries).toEqual([...state.originalCommands, state.contribution])
  expect(state.contribution.name).toBe(DESKTOP_SKILLS_COMMAND)
  expect(state.contribution.label?.()).toBe('技能库')
  expect(state.contribution.available({ sessionId: 'test-session' } as never)).toBe(true)
  expect(document.querySelector('input[type="file"]')).toBeTruthy()
  expect(document.querySelector('button[aria-label="添加文件或调用指令"]')).toBeTruthy()
})

it('waits for the native pick to finish, then clicks the same existing skill button without fetching', async () => {
  const state = fixture()
  state.run()
  expect(state.clicked).not.toHaveBeenCalled()
  await Promise.resolve()
  expect(state.clicked).toHaveBeenCalledTimes(1)
  expect(state.menu.hidden).toBe(false)
  expect(document.querySelectorAll('#dsh-desktop-skills-menu')).toHaveLength(1)
  expect(state.bridge).not.toHaveBeenCalled()
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

it('does not toggle an already open skill list closed', async () => {
  const state = fixture()
  state.button.click()
  state.run()
  await Promise.resolve()
  expect(state.clicked).toHaveBeenCalledTimes(1)
  expect(state.menu.hidden).toBe(false)
})

it.each(['bridge', 'button', 'disabled', 'handler', 'throw'])('shows a visible failure for unavailable %s and supports retry', async reason => {
  const state = fixture()
  if (reason === 'bridge') Reflect.deleteProperty(window, 'dshDesktop')
  if (reason === 'button') state.button.remove()
  if (reason === 'disabled') state.button.disabled = true
  if (reason === 'handler') state.button.removeEventListener('click', state.clicked)
  if (reason === 'throw') vi.spyOn(state.button, 'click').mockImplementation(() => { throw new Error('blocked') })
  state.run()
  await Promise.resolve()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('无法打开技能库')
  expect(state.bridge).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: { listSkills: state.bridge } })
  state.button.disabled = false
  document.querySelector('[data-composer-card]')!.append(state.button)
  state.button.removeEventListener('click', state.clicked)
  state.button.addEventListener('click', state.clicked)
  state.run()
  await Promise.resolve()
  expect(state.menu.hidden).toBe(false)
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

it('unregisters only itself, retracts its error, and cancels queued or stale actions on dispose', async () => {
  const state = fixture()
  state.button.remove()
  state.run()
  await Promise.resolve()
  expect(document.querySelector('[role="alert"]')).toBeTruthy()
  state.run()
  dispose!()
  dispose!()
  await Promise.resolve()
  state.run()
  await Promise.resolve()
  expect(state.unregister).toHaveBeenCalledTimes(1)
  expect(state.entries).toEqual(state.originalCommands)
  expect(document.querySelector('[role="alert"]')).toBeNull()
  expect(state.clicked).not.toHaveBeenCalled()
})
