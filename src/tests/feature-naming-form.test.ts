// @vitest-environment jsdom
// TESTING
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// COMPONENTS
import FeatureNamingSettings from '#lib/bits/patterns/forms/featureIntent/FeatureNamingSettings.svelte'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'

vi.mock('#lib/api/featureIntents.remote.js', () => ({
  getFeatureNameProperties: vi
    .fn()
    .mockResolvedValue([
      { id: 'caption', label: 'Caption', test: 'hasValue', examples: {} },
    ]),
  getFeatureNameFieldsProject: vi.fn().mockResolvedValue('project'),
}))
vi.mock('#lib/api/translation.remote.js', () => ({ translateContentField: vi.fn() }))
afterEach(cleanup)

it('adds a layer naming condition without submitting or leaking unbound fields', async () => {
  vi.useRealTimers()
  const form = document.createElement('form')
  document.body.append(form)
  const onSubmit = vi.fn((event: Event) => event.preventDefault())
  form.addEventListener('submit', onSubmit)
  const onChange = vi.fn()
  const props = {
    scopeType: 'layer' as const,
    scopeId: 'layer',
    rule: { base: 'feature', conditions: [] } as FeatureNameRule,
    locales: ['en'],
    onChange,
  }
  const { getByRole, rerender } = render(FeatureNamingSettings, { target: form, props })
  try {
    const add = getByRole('button', { name: 'Add condition' }) as HTMLButtonElement
    await waitFor(() => expect(add.disabled).toBe(false))
    await fireEvent.click(add)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [
          expect.objectContaining({ propertyId: 'caption', test: 'hasValue' }),
        ],
      }),
    )
    await rerender({ ...props, rule: onChange.mock.calls[0][0] })
    expect(getByRole('button', { name: 'Remove Caption rule' })).toBeTruthy()
    expect([...new FormData(form).entries()]).toEqual([])
  } finally {
    form.remove()
  }
})
