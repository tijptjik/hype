// @vitest-environment jsdom
// TESTING
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
// COMPONENTS
import FeatureFieldMultiSelect from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldMultiSelect.svelte'
// PROPERTY VALUES
import { encodePropertySelection } from '#lib/properties/selection.js'

afterEach(cleanup)

it('adds and removes independent choices and retains both labels in read-only mode', async () => {
  const onChange = vi.fn()
  const props = {
    id: 'stratigraphy',
    options: [
      { value: 'overpainted', label: 'Overpainted' },
      { value: 'revealed', label: 'Revealed' },
    ],
    value: encodePropertySelection(['overpainted']),
    onChange,
  }
  const view = render(FeatureFieldMultiSelect, props)
  expect(
    (screen.getByRole('checkbox', { name: 'Overpainted' }) as HTMLInputElement).checked,
  ).toBe(true)
  await fireEvent.click(screen.getByRole('checkbox', { name: 'Revealed' }))
  const both = encodePropertySelection(['overpainted', 'revealed'])
  expect(onChange).toHaveBeenLastCalledWith(both)
  await view.rerender({ ...props, value: both })
  await fireEvent.click(screen.getByRole('checkbox', { name: 'Overpainted' }))
  expect(onChange).toHaveBeenLastCalledWith(encodePropertySelection(['revealed']))
  await view.rerender({ ...props, value: both, isEditing: false })
  expect(screen.getByText('Overpainted; Revealed')).toBeTruthy()
  expect(screen.queryByRole('checkbox')).toBeNull()
})
