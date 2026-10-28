// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import VisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('defaults to Shared and requires an explicit choice to select Organisation-only', async () => {
  const onChange = vi.fn()
  render(VisibilitySelect, { onChange })
  const control = screen.getByRole('combobox')
  expect(control.textContent).toContain('Shared')
  expect(onChange).not.toHaveBeenCalled()
  await fireEvent.click(control)
  await fireEvent.keyDown(control, { key: 'ArrowDown' })
  await fireEvent.keyDown(control, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith('exclusive')
  expect(control.textContent).toContain('Organisation-only')
})

it('requires an explicit choice when the organisation default is unavailable', async () => {
  const onChange = vi.fn()
  render(VisibilitySelect, { value: null, onChange })
  const control = screen.getByRole('combobox')
  expect(control.textContent).toContain('Location visibility')
  expect(onChange).not.toHaveBeenCalled()
  await fireEvent.click(control)
  await fireEvent.keyDown(control, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith('shared')
})
