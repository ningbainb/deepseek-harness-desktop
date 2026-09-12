// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { BoardController } from '../src/core/controller.ts'
import type { ExecutionService } from '../src/core/execution.ts'
import type { TaskStore } from '../src/core/store.ts'
import { createTask, type TaskRecord } from '../src/core/tasks.ts'
import { TaskBoard } from '../src/client/board/TaskBoard.tsx'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let controller: BoardController | undefined
afterEach(async () => { await act(async () => { root?.unmount() }); controller?.dispose(); root = undefined; controller = undefined; document.body.replaceChildren() })

async function mount() {
  const task = { ...createTask({ title: 'Scheduled task', description: '', prompt: '' }, 1, 'task-a'), schedule: { cron: '0 9 * * *', enabled: true, nextRunAt: Date.now() + 60_000, lastTriggeredAt: undefined } }
  let saved: TaskRecord[] = [task]
  const store: TaskStore = { load: () => structuredClone(saved), save: vi.fn(async tasks => { saved = structuredClone(tasks) as TaskRecord[] }), clear: () => {} }
  controller = new BoardController({ store, exec: { reconcile: () => undefined } as unknown as ExecutionService, sessions: { list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} }, open: () => {} } })
  controller.start()
  controller.openTask(task.id)
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(<TaskBoard controller={controller!} />) })
  return { store, saved: () => saved, container }
}

it('warns that a failed schedule change is an unsaved draft and retries it from the detail', async () => {
  const { store, saved, container } = await mount()
  vi.mocked(store.save).mockRejectedValueOnce(new Error('HTTP 500'))
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => { checkbox.click(); await controller!.waitForPersistence() })
  expect(checkbox.checked).toBe(false)
  expect(saved()[0].schedule?.enabled).toBe(true)
  const detail = container.querySelector('[role="dialog"]')!
  const alert = detail.querySelector('[role="alert"]')!
  expect(alert.textContent).toContain('保存未成功')
  expect(alert.textContent).toContain('定时任务仍按已保存的设置运行')
  const run = [...detail.querySelectorAll('button')].find(button => button.textContent === '执行')!
  expect(run.disabled).toBe(true)
  const retry = [...alert.querySelectorAll('button')].find(button => button.textContent === '重试保存')!
  await act(async () => { retry.click(); await controller!.waitForPersistence() })
  expect(saved()[0].schedule?.enabled).toBe(false)
  expect(detail.querySelector('[role="alert"]')).toBeNull()
  expect(run.disabled).toBe(false)
})

it('requires confirmation before discarding an unsaved draft and restores the saved schedule', async () => {
  const { store, saved, container } = await mount()
  vi.mocked(store.save).mockRejectedValueOnce(new Error('HTTP 500'))
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => { checkbox.click(); await controller!.waitForPersistence() })
  const detail = container.querySelector('[role="dialog"]')!
  const reload = [...detail.querySelectorAll('button')].find(button => button.textContent === '重新载入已保存内容')!
  await act(async () => { reload.click() })
  expect(checkbox.checked).toBe(false)
  expect(container.textContent).toContain('放弃此窗口未保存的更改并重新载入')
  const dialog = container.querySelector('[role="alertdialog"]')!
  const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent === '重新载入已保存内容')!
  await act(async () => { confirm.click(); await controller!.waitForPersistence() })
  expect(checkbox.checked).toBe(true)
  expect(saved()[0].schedule?.enabled).toBe(true)
  expect(detail.querySelector('[role="alert"]')).toBeNull()
})
