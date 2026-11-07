// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/ClickableTooltipFixture.svelte'
import VisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('suppresses snippet help that only repeats its visible trigger label', async () => {
  render(Fixture, { repeatedText: true })
  await fireEvent.click(screen.getByRole('button', { name: 'Help' }))
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
})

it('opens on click, toggles closed, and supports keyboard activation and Escape', async () => {
  render(Fixture)
  const trigger = screen.getByRole('button', { name: 'Help' })
  expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
  await fireEvent.click(trigger)
  expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toContain(
    'Useful help',
  )
  await fireEvent.click(trigger)
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
  await fireEvent.keyDown(trigger, { key: 'Enter' })
  expect(await screen.findByRole('tooltip', { hidden: true })).toBeTruthy()
  await fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
})

it('preserves nested button keyboard actions without submitting the enclosing form', async () => {
  render(Fixture)
  const user = userEvent.setup()
  screen.getByRole('button', { name: 'Action' }).focus()
  await user.keyboard('{Enter}')
  expect(screen.getByTestId('activations').textContent).toBe('1')
  expect(screen.getByTestId('submissions').textContent).toBe('0')
  expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toContain(
    'Action help',
  )
})

it('keeps controlled automatic notices working', async () => {
  render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Show notice' }))
  expect((await screen.findByText('Automatic notice')).getAttribute('role')).toBe(
    'status',
  )
})

it('leaves disabled triggers without overlay behavior', async () => {
  render(Fixture, { disabled: true })
  await fireEvent.click(screen.getByText('Help', { exact: true }))
  expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
})

it('opens visibility help on click with separate choices and a final paragraph', async () => {
  render(VisibilitySelect, { onChange: vi.fn() })
  await fireEvent.click(screen.getByRole('button', { name: 'Location visibility' }))
  const help = await screen.findByRole('tooltip', { hidden: true })
  expect(
    [...help.querySelectorAll('strong')].map(element => element.textContent),
  ).toEqual(['Shared', 'Organisation-only'])
  expect(help.querySelectorAll('ul > li')).toHaveLength(2)
  expect(help.querySelectorAll('p')).toHaveLength(2)
  expect(help.textContent).toContain('Visibility defines reuse')
  expect(help.textContent).toContain(
    'Your edits stay yours. Changes by other organisations won’t replace them.',
  )
})

it('dismisses pinned help when its list scrolls or the viewport resizes', async () => {
  const view = render(Fixture)
  const trigger = screen.getByRole('button', { name: 'Help' })
  await fireEvent.click(trigger)
  await screen.findByRole('tooltip', { hidden: true })
  await fireEvent.scroll(view.container.querySelector('form')!)
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
  await fireEvent.click(trigger)
  await screen.findByRole('tooltip', { hidden: true })
  await fireEvent(window, new Event('resize'))
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
})
