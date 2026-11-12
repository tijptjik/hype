// @vitest-environment jsdom
// TESTING
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// COMPONENTS
import FeatureNamingSettings from '#lib/bits/patterns/forms/featureIntent/FeatureNamingSettings.svelte'

vi.mock('#lib/context/responsive.svelte.js', async importOriginal => {
  const module =
    await importOriginal<typeof import('#lib/context/responsive.svelte.js')>()
  return { ...module, getResponsiveCtx: () => new module.ResponsiveCtx() }
})

const publish = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'saved', version: 1 }))
vi.mock('#lib/api/featureIntents.remote.js', () => ({
  getFeatureNameProperties: vi
    .fn()
    .mockResolvedValue([{ id: 'caption', label: 'Caption' }]),
  getFeatureNamingTemplates: vi.fn(() =>
    Object.assign(Promise.resolve([]), { refresh: vi.fn().mockResolvedValue([]) }),
  ),
  publishFeatureNamingTemplate: publish,
}))
afterEach(cleanup)
it('publishes a property-only template in layer context without submitting the parent form', async () => {
  vi.useRealTimers()
  const form = document.createElement('form')
  document.body.append(form)
  const onSubmit = vi.fn((event: Event) => event.preventDefault())
  form.addEventListener('submit', onSubmit)
  const onChange = vi.fn()
  const view = render(FeatureNamingSettings, {
    target: form,
    props: {
      scopeType: 'layer',
      scopeId: 'layer',
      rule: { base: 'feature', conditions: [] },
      locales: ['en'],
      onChange,
    },
  })
  try {
    const create = view.getByRole('button', {
      name: 'Create template',
    }) as HTMLButtonElement
    await waitFor(() => expect(create.disabled).toBe(false))
    await fireEvent.click(create)
    await fireEvent.input(view.getByRole('textbox', { name: 'Template name' }), {
      target: { value: 'Caption only' },
    })
    await fireEvent.input(view.getByRole('textbox', { name: 'Expression' }), {
      target: { value: '{{ properties.caption }}' },
    })
    expect([...new FormData(form).entries()]).toEqual([])
    await fireEvent.click(view.getByRole('button', { name: 'Save template' }))
    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'layer', id: 'layer' },
          definition: expect.objectContaining({
            locales: { en: '{{ properties.caption }}' },
          }),
        }),
      ),
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ registry: { id: 'saved', version: 1 } }),
    )
    expect(onSubmit).not.toHaveBeenCalled()
  } finally {
    form.remove()
  }
})

it.each(['feature', 'location'] as const)(
  'shows the inherited %s name and accepts without creating an override',
  async base => {
    vi.useRealTimers()
    const { default: RuleEditor } = await import(
      '#lib/bits/patterns/forms/featureIntent/FeatureNamingRuleEditor.svelte'
    )
    const onAccept = vi.fn()
    const view = render(RuleEditor, {
      props: {
        id: 'naming',
        scopeType: 'project',
        scopeId: 'hkghostsigns',
        inheritedRule: { base, conditions: [] },
        locales: ['en'],
        onAccept,
        onCancel: vi.fn(),
      },
    })
    expect(
      view.getByRole('combobox', { name: 'Naming template' }).textContent,
    ).toContain(
      `${base === 'location' ? 'Linked location name' : 'Feature name'} · inherited default`,
    )
    expect(view.getByText('Using inherited default')).toBeTruthy()
    expect(view.queryByText('No template selected')).toBeNull()
    await fireEvent.click(view.getByRole('button', { name: 'Accept naming rule' }))
    expect(onAccept).toHaveBeenCalledWith(undefined)
  },
)
