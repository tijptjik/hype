// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PublishChildrenDialog from './fixtures/components/PublishChildrenDialogFixture.svelte'

beforeEach(() => {
  vi.useRealTimers()
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(cleanup)

it.each([
  ['organisation', 'projects, layers and features'],
  ['project', 'layers and features'],
  ['layer', 'features'],
] as const)('names all descendant types for %s', async (resourceType, children) => {
  const onChoice = vi.fn()
  render(PublishChildrenDialog, { resourceType, onChoice, onCancel: vi.fn() })
  expect(await screen.findByRole('dialog')).toBeTruthy()
  expect(
    screen.getByText(
      `Do you also want to automatically publish all ${children} associated with this ${resourceType}?`,
    ),
  ).toBeTruthy()
  expect(onChoice).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Publish all' }))
  expect(onChoice).toHaveBeenCalledExactlyOnceWith(true)
})

it('allows publication while retaining child states', async () => {
  const onChoice = vi.fn()
  render(PublishChildrenDialog, { resourceType: 'layer', onChoice, onCancel: vi.fn() })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Keep child states' }),
  )
  expect(onChoice).toHaveBeenCalledExactlyOnceWith(false)
})

it('cancels without publishing', async () => {
  const onChoice = vi.fn()
  const onCancel = vi.fn()
  render(PublishChildrenDialog, { resourceType: 'layer', onChoice, onCancel })
  await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onChoice).not.toHaveBeenCalled()
})

it('dismisses with Escape without publishing', async () => {
  const onChoice = vi.fn()
  const onCancel = vi.fn()
  render(PublishChildrenDialog, { resourceType: 'project', onChoice, onCancel })
  await fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onChoice).not.toHaveBeenCalled()
})

it.each([false, true])(
  'preview confirms the same child choice (%s) without publication wording',
  async publishChildren => {
    const onChoice = vi.fn()
    render(PublishChildrenDialog, {
      resourceType: 'project',
      mode: 'preview',
      onChoice,
      onCancel: vi.fn(),
    })
    expect(
      await screen.findByRole('dialog', { name: 'Preview publication' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish all' })).toBeNull()
    await fireEvent.click(
      screen.getByRole('button', {
        name: publishChildren ? 'Preview all children' : 'Preview existing selections',
      }),
    )
    expect(onChoice).toHaveBeenCalledExactlyOnceWith(publishChildren)
  },
)
