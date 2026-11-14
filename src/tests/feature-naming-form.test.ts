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
  getFeatureNamingExamples: vi.fn().mockResolvedValue([]),
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
    await fireEvent.click(
      view.getByRole('button', { name: 'Select {{ feature.name }}' }),
    )
    await fireEvent.click(view.getByRole('button', { name: /Caption/ }))
    expect([...new FormData(form).entries()]).toEqual([])
    await fireEvent.click(view.getByRole('button', { name: 'Save template' }))
    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'layer', id: 'layer' },
          definition: expect.objectContaining({
            locales: {
              en: '{{ properties.caption }}',
              'zh-Hant': '{{ properties.caption }}',
              'zh-Hans': '{{ properties.caption }}',
            },
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
      `${base === 'location' ? 'Linked location name' : 'Feature name'} · default`,
    )
    expect(view.getByText('Using default naming')).toBeTruthy()
    expect(
      view
        .getByRole('dialog', {
          name: 'How should the features in your project be named?',
        })
        .closest('form'),
    ).toBeNull()
    expect(view.queryByText('No template selected')).toBeNull()
    expect(view.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(view.queryByText('Template scope and naming inputs')).toBeNull()
    const create = view.getByRole('button', { name: 'Create template' })
    const accept = view.getByRole('button', { name: 'Accept naming rule' })
    expect(create.closest('footer')).toBe(accept.closest('footer'))
    expect(create.closest('footer')).not.toBeNull()
    await fireEvent.click(view.getByRole('button', { name: 'Accept naming rule' }))
    expect(onAccept).toHaveBeenCalledWith(undefined)
  },
)

it('saves a new template directly into application review without a second acceptance', async () => {
  vi.useRealTimers()
  const { default: RuleEditor } = await import(
    '#lib/bits/patterns/forms/featureIntent/FeatureNamingRuleEditor.svelte'
  )
  const onAccept = vi.fn()
  const view = render(RuleEditor, {
    props: {
      id: 'create-naming',
      scopeType: 'hub',
      scopeId: 'hub',
      inheritedRule: { base: 'feature', conditions: [] },
      locales: ['en'],
      onAccept,
      onCancel: vi.fn(),
    },
  })
  const create = view.getByRole('button', {
    name: 'Create template',
  }) as HTMLButtonElement
  await waitFor(() => expect(create.disabled).toBe(false))
  await fireEvent.click(create)
  expect(view.queryByRole('combobox', { name: 'Naming template' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Accept naming rule' })).toBeNull()
  const save = view.getByRole('button', { name: 'Save template' })
  expect(save.closest('footer')).not.toBeNull()
  expect(
    view.getByRole('button', { name: 'Cancel' }).compareDocumentPosition(save) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  await fireEvent.input(view.getByRole('textbox', { name: 'Template name' }), {
    target: { value: 'New template' },
  })
  await fireEvent.click(save)
  await waitFor(() =>
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ registry: { id: 'saved', version: 1 } }),
    ),
  )
})

it('syncs linked languages, isolates custom edits and reconnects them', async () => {
  vi.useRealTimers()
  publish.mockClear()
  const view = render(FeatureNamingSettings, {
    props: {
      scopeType: 'layer',
      scopeId: 'layer',
      rule: { base: 'feature', conditions: [] },
      locales: ['en', 'zh-Hant', 'zh-Hans'],
      onChange: vi.fn(),
    },
  })
  const create = view.getByRole('button', {
    name: 'Create template',
  }) as HTMLButtonElement
  await waitFor(() => expect(create.disabled).toBe(false))
  await fireEvent.click(create)
  await fireEvent.input(view.getByRole('textbox', { name: 'Template name' }), {
    target: { value: 'Shared names' },
  })
  await fireEvent.input(view.getByRole('textbox', { name: 'Text 1', exact: true }), {
    target: { value: 'Shared ' },
  })
  await fireEvent.click(view.getByRole('tab', { name: '繁體中文' }))
  expect(
    (view.getByRole('textbox', { name: 'Text 1', exact: true }) as HTMLInputElement)
      .value,
  ).toBe('Shared ')
  await fireEvent.click(view.getByRole('button', { name: 'Customize this language' }))
  await fireEvent.input(view.getByRole('textbox', { name: 'Text 1', exact: true }), {
    target: { value: 'Custom ' },
  })
  await fireEvent.click(view.getByRole('tab', { name: 'English' }))
  await fireEvent.input(view.getByRole('textbox', { name: 'Text 1', exact: true }), {
    target: { value: 'Updated ' },
  })
  await fireEvent.click(view.getByRole('tab', { name: '简体中文' }))
  expect(
    (view.getByRole('textbox', { name: 'Text 1', exact: true }) as HTMLInputElement)
      .value,
  ).toBe('Updated ')
  await fireEvent.click(view.getByRole('tab', { name: '繁體中文' }))
  expect(
    (view.getByRole('textbox', { name: 'Text 1', exact: true }) as HTMLInputElement)
      .value,
  ).toBe('Custom ')
  await fireEvent.click(view.getByRole('button', { name: 'Use shared expression' }))
  expect(
    (view.getByRole('textbox', { name: 'Text 1', exact: true }) as HTMLInputElement)
      .value,
  ).toBe('Updated ')
  await fireEvent.click(view.getByRole('button', { name: 'Save template' }))
  await waitFor(() =>
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          locales: {
            en: 'Updated {{ feature.name }}',
            'zh-Hant': 'Updated {{ feature.name }}',
            'zh-Hans': 'Updated {{ feature.name }}',
          },
          localeSync: {
            sharedExpression: 'Updated {{ feature.name }}',
            customLocales: [],
          },
        }),
      }),
    ),
  )
})
