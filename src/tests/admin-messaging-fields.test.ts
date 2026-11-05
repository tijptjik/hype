// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import Fixture from './fixtures/components/AdminMessagingDraftFixture.svelte'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('keeps typed service details in the shared draft until submit and resets them with the form', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const view = render(Fixture)
  const telegram = view.getByLabelText('Telegram') as HTMLInputElement
  telegram.value = '@draft_only'
  telegram.dispatchEvent(new Event('input', { bubbles: true }))
  telegram.dispatchEvent(new FocusEvent('blur'))
  flushSync()
  expect(view.getByTestId('dirty').textContent).toBe('Dirty')
  expect(telegram.value).toBe('@draft_only')
  expect(fetch).not.toHaveBeenCalled()
  expect(view.queryByText('Unsaved')).toBeNull()
  expect(view.queryByText('Checking…')).toBeNull()
  view.getByRole('button', { name: 'Reset' }).click()
  flushSync()
  expect(telegram.value).toBe('')
  expect(view.getByTestId('dirty').textContent).toBe('Clean')
  expect(fetch).not.toHaveBeenCalled()
})

it('copies a valid profile phone into the draft without saving, and Reset restores it', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const view = render(Fixture, { phoneNumber: '91234567' })
  const copyButton = view.getByRole('button', { name: 'Use phone number for Telegram' })
  expect(copyButton.closest('.bits-form__control-wrap')?.querySelector('input')).toBe(
    view.getByLabelText('Telegram'),
  )
  copyButton.click()
  flushSync()
  expect((view.getByLabelText('Telegram') as HTMLInputElement).value).toBe(
    '+85291234567',
  )
  expect(
    view.queryByRole('button', { name: 'Use phone number for Telegram' }),
  ).toBeNull()
  expect(view.getByTestId('dirty').textContent).toBe('Dirty')
  view.getByRole('button', { name: 'Reset' }).click()
  flushSync()
  expect((view.getByLabelText('Telegram') as HTMLInputElement).value).toBe('')
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['', '123', '@username'])(
  'does not offer an invalid main phone: %s',
  phoneNumber => {
    const view = render(Fixture, { phoneNumber })
    expect(
      view.queryByRole('button', { name: 'Use phone number for Telegram' }),
    ).toBeNull()
  },
)

it.each([false, true])('uses resource field appearance with editing=%s', editing => {
  const view = render(Fixture, { editing })
  const field = view.getByLabelText('Telegram').closest('.bits-form__control-wrap')!
  expect(field.classList.contains('bg-transparent!')).toBe(true)
  expect(
    field.classList.contains(editing ? 'border-border/30!' : 'border-transparent!'),
  ).toBe(true)
  expect((view.getByLabelText('Telegram') as HTMLInputElement).readOnly).toBe(!editing)
})
