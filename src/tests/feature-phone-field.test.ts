// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import PhoneField from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldTextArea.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('edits arrays as separate lines and retains a new line while typing', async () => {
  const onChange = vi.fn()
  const view = render(PhoneField, {
    id: 'phone',
    isPhone: true,
    value: '["+85223456789","+85291234567"]',
    onChange,
  })
  const input = screen.getByRole('textbox') as HTMLTextAreaElement
  expect(input.value).toBe('+85223456789\n+85291234567')
  const edited = '+85223456789\n+85291234567\n'
  await fireEvent.input(input, { target: { value: edited } })
  expect(onChange).toHaveBeenCalledWith(edited)
  await view.rerender({ id: 'phone', isPhone: true, value: edited, onChange })
  expect(input.value).toBe(edited)
})

it('keeps malformed legacy input visible for correction', () => {
  render(PhoneField, {
    id: 'phone',
    isPhone: true,
    value: '[broken',
    onChange: vi.fn(),
  })
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('[broken')
})
