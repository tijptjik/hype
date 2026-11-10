// @vitest-environment jsdom
// TESTING
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// COMPONENTS
import FeaturePolicyChoice from '#lib/bits/patterns/forms/featureIntent/FeaturePolicyChoice.svelte'

afterEach(cleanup)

it('keeps policy radio groups out of the enclosing remote form payload', async () => {
  vi.useRealTimers()
  const form = document.createElement('form')
  document.body.append(form)
  const onChange = vi.fn()
  const { getByRole } = render(FeaturePolicyChoice, {
    target: form,
    props: {
      label: 'Policy',
      value: 'one',
      options: [
        { value: 'one', title: 'One', description: 'First' },
        { value: 'two', title: 'Two', description: 'Second' },
      ],
      onChange,
    },
  })
  try {
    expect([...new FormData(form).entries()]).toEqual([])
    const second = getByRole('radio', { name: 'Two' }) as HTMLInputElement
    await fireEvent.click(second)
    expect(onChange).toHaveBeenCalledWith('two')
    expect(second.checked).toBe(true)
    expect((getByRole('radio', { name: 'One' }) as HTMLInputElement).checked).toBe(
      false,
    )
    expect([...new FormData(form).entries()]).toEqual([])
  } finally {
    form.remove()
  }
})
