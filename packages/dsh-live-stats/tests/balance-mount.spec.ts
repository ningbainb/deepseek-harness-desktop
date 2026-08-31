/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { BalanceController } from '../src/client/balance-controller.ts'
import { mountBalanceView } from '../src/client/balance-mount.tsx'

afterEach(() => {
  document.documentElement.removeAttribute('data-dsh-balance-active')
  document.body.innerHTML = ''
})

describe('balance view native navigation', () => {
  it('closes before the shell opens a clicked conversation row', () => {
    document.body.innerHTML = `
      <aside data-pane="sidebar">
        <button class="sessionRow" type="button"><span>Imported conversation</span></button>
      </aside>
      <main class="centerCol"><div class="conversation-content">Conversation</div></main>
    `

    const controller = new BalanceController()
    controller.fetchBalance = async () => {}
    const dispose = mountBalanceView(controller)
    try {
      controller.setOpen(true)
      expect(controller.getSnapshot().open).toBe(true)
      expect(document.documentElement.hasAttribute('data-dsh-balance-active')).toBe(true)

      document.querySelector('.sessionRow span')?.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }))

      expect(controller.getSnapshot().open).toBe(false)
      expect(document.documentElement.hasAttribute('data-dsh-balance-active')).toBe(false)
    } finally {
      dispose()
    }
  })
})
