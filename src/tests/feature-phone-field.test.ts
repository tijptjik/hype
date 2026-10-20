// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import Phone from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldPhone.svelte'
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it('shows stored phone collections as compact telephone inputs and preserves other numbers', async () => {
  const onChange = vi.fn()
  render(Phone, { id: 'phone', value: '["+85223456789","+85291234567"]', onChange })
  const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
  expect(inputs.map(input => input.type)).toEqual(['tel', 'tel'])
  expect(inputs.map(input => input.value)).toEqual(['+85223456789', '+85291234567'])
  await fireEvent.input(inputs[0], { target: { value: '23456780' } })
  expect(JSON.parse(onChange.mock.lastCall![0])).toEqual(['23456780', '+85291234567'])
})
it('allows clearing the final phone number', async () => {
  const onChange = vi.fn()
  render(Phone, { id: 'phone', value: '23456789', onChange })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: '' } })
  expect(onChange).toHaveBeenLastCalledWith('')
})

it('waits until blur to show an invalid phone number', async () => {
  const onChange = vi.fn()
  const view = render(Phone, { id: 'phone', value: '123', onChange })
  expect(screen.queryByText(/Enter a valid international/)).toBeNull()
  await fireEvent.focus(screen.getByRole('textbox'))
  expect(screen.queryByText(/Enter a valid international/)).toBeNull()
  await fireEvent.blur(screen.getByRole('textbox'))
  expect(screen.getByText(/Enter a valid international/)).toBeTruthy()
  await fireEvent.focus(screen.getByRole('textbox'))
  expect(screen.queryByText(/Enter a valid international/)).toBeNull()
  await view.rerender({ id: 'phone', value: '+12025550123', onChange })
  await fireEvent.blur(screen.getByRole('textbox'))
  expect(screen.queryByText(/Enter a valid international/)).toBeNull()
})

it('shows a phone issue when submission validates the field, and clears it on input', async () => {
  render(Phone, {
    id: 'submit-phone',
    value: 'invalid',
    isEditing: true,
    onChange: vi.fn(),
  })
  const input = screen.getByRole('textbox')
  await fireEvent.focus(input)
  await fireEvent.invalid(input)
  expect(screen.getByText(/Enter a valid international/)).toBeTruthy()
  await fireEvent.input(input, { target: { value: '+31613401674' } })
  expect(screen.queryByText(/Enter a valid international/)).toBeNull()
})

it('displays local and international numbers with flags and spaced dial links without input boxes', () => {
  render(Phone, {
    id: 'display-phone',
    value: '["23456789","+12025550123"]',
    isEditing: false,
    onChange: vi.fn(),
  })
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(
    screen.getByRole('link', { name: '+852 2345 6789' }).getAttribute('href'),
  ).toBe('tel:+85223456789')
  expect(
    screen.getByRole('link', { name: '+1 202 555 0123' }).getAttribute('href'),
  ).toBe('tel:+12025550123')
  expect(screen.getByRole('img', { name: 'HK' }).textContent).toBe('🇭🇰')
  expect(screen.getByRole('img', { name: 'US' }).textContent).toBe('🇺🇸')
})
