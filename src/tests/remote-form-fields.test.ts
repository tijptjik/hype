// @vitest-environment jsdom
// TESTING
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, describe, expect, it, vi } from 'vitest'
// SVELTEKIT
// @ts-expect-error The private JS runtime has no declarations; exercise the installed parser.
import * as kitForms from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
// COMPONENTS
import FormFieldCard from '#lib/bits/patterns/forms/formFieldsSection/components/FormFieldCard.svelte'
import FormFieldCardBody from '#lib/bits/patterns/forms/formFieldsSection/components/FormFieldCardBody.svelte'
// TYPES
import type { Property } from '#lib/db/zod/schema/property.types.js'

// Field rendering is real; visual wrappers are irrelevant to the submission contract.
vi.mock('#lib/bits/custom/form/index.js', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { SelectField: Component, Skeleton: Component, TextInput: Component }
})

vi.mock(
  '#lib/bits/patterns/forms/formFieldsSection/components/FormFieldCardHeader.svelte',
  () => import('./mocks/svelte-component.svelte'),
)

afterEach(cleanup)

describe('SvelteKit 3 custom property controls', () => {
  it.each([
    { isTranslatable: true, presentation: 'body' },
    { isTranslatable: false, presentation: 'body' },
    { isTranslatable: true, presentation: 'full' },
    { isTranslatable: false, presentation: 'header' },
  ] as const)(
    'submits bound property fields ($presentation, translatable: $isTranslatable)',
    ({ isTranslatable, presentation }) => {
      const property = {
        id: 'property',
        rank: 2,
        type: 'classifier',
        scope: 'project',
        hubId: 'hub',
        key: 'category',
        component: 'SelectField',
        isDefaultEnabled: true,
        isTranslatable,
        i18n: { en: { label: 'Category', labelGen: true, placeholderGen: false } },
        values: [
          { id: 'option', rank: 0, value: 'Cafe', i18n: { en: { value: 'Cafe' } } },
        ],
      } as unknown as Property
      const input = { data: { properties: [property] } }
      const fields = kitForms.create_field_proxy({
        form_id: 'property-form',
        get: () => input,
        set: vi.fn(),
        get_issues: () => ({}),
        get_touched: () => ({}),
        get_dirty: () => ({}),
      })
      const { container } = render(
        presentation === 'body' ? FormFieldCardBody : FormFieldCard,
        {
          ...(presentation === 'body' ? {} : { presentation }),
          totalItems: 1,
          removeMode: false,
          onIncreaseRank: vi.fn(),
          onDecreaseRank: vi.fn(),
          onRemove: vi.fn(),
          property,
          propertyIndex: 0,
          sectionRank: 0,
          propertyFields: fields.data.properties[0],
          locales: ['en'],
          classifierComponents: ['SelectField'],
          specifierComponents: [],
          isRequiredInPreflight: () => false,
          isEditing: false,
          onUpdateBase: vi.fn(),
          onUpdateI18n: vi.fn(),
          onAddValue: vi.fn(),
          onSortValuesAlphabetically: vi.fn(),
          onRemoveValue: vi.fn(),
          onMoveValue: vi.fn(),
          onUpdateValue: vi.fn(),
          onUpdateValueI18n: vi.fn(),
          onTranslateLocale: vi.fn(),
          onResetLocale: vi.fn(),
        },
      )
      const formData = new FormData()
      for (const control of container.querySelectorAll<HTMLInputElement>(
        'input[type="hidden"]',
      )) {
        expect(control.name).toMatch(/\/property-form$/)
        formData.append(control.name, control.value)
      }
      const result = kitForms.convert_formdata('property-form', formData)
      expect(result).toMatchObject({
        data: {
          properties: [
            {
              id: 'property',
              type: 'classifier',
              scope: 'project',
              hubId: 'hub',
              isDefaultEnabled: true,
              isTranslatable,
              i18n: { en: { labelGen: true, placeholderGen: false } },
              ...(presentation === 'body' ? {} : { rank: 2 }),
              ...(presentation === 'header'
                ? {}
                : {
                    values: [
                      {
                        id: 'option',
                        rank: 0,
                        ...(isTranslatable
                          ? { i18n: { en: { value: 'Cafe' } } }
                          : { value: 'Cafe' }),
                      },
                    ],
                  }),
            },
          ],
        },
      })
    },
  )
})
