import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetProjectPropertyLocale,
  sortProjectPropertyValuesAlphabetically,
  translateProjectPropertyLocale,
} from '#lib/client/services/property.js'

const { translateTextMock } = vi.hoisted(() => ({
  translateTextMock: vi.fn(),
}))

vi.mock('#lib/api/translation.remote.js', () => ({
  translateText: translateTextMock,
}))

type FormState<T> = {
  data: T
}

function createForm<T>(data: T): {
  form: {
    fields: {
      value: () => FormState<T>
      set: (next: FormState<T>) => void
    }
  }
  getData: () => T
} {
  let state: FormState<T> = { data }

  return {
    form: {
      fields: {
        value: () => state,
        set: next => {
          state = next
        },
      },
    },
    getData: () => state.data,
  }
}

describe('property services', () => {
  beforeEach(() => {
    translateTextMock.mockReset()
  })

  it('translates empty property value locale rows', async () => {
    translateTextMock.mockResolvedValue(['Translated value'])

    const { form, getData } = createForm({
      properties: [
        {
          id: 'property-1',
          key: 'amenity',
          type: 'classifier',
          scope: 'project',
          component: 'SelectField',
          rank: 0,
          isTranslatable: true,
          i18n: {
            en: { locale: 'en', label: 'Amenity', placeholder: 'Choose one' },
            zhHans: {
              locale: 'zh-hans',
              label: '设施',
              placeholder: '请选择',
            },
            zhHant: { locale: 'zh-hant', label: '', placeholder: '' },
          },
          values: [
            {
              id: 'value-1',
              propertyId: 'property-1',
              rank: 0,
              value: '',
              i18n: {
                en: {
                  locale: 'en',
                  propertyValueId: 'value-1',
                  value: 'Cafe',
                  valueGen: false,
                },
                zhHans: {
                  locale: 'zh-hans',
                  propertyValueId: 'value-1',
                  value: '',
                  valueGen: false,
                },
                zhHant: {
                  locale: 'zh-hant',
                  propertyValueId: 'value-1',
                  value: '',
                  valueGen: false,
                },
              },
            },
          ],
        },
      ],
    })

    const translated = await translateProjectPropertyLocale(
      form as never,
      'property-1',
      'en',
      'zh-hans',
    )

    expect(translated).toBe(true)
    expect(translateTextMock).toHaveBeenCalledWith({
      source: 'en',
      target: 'zhHans',
      texts: ['Cafe'],
    })
    expect(getData().properties[0]?.values?.[0]?.i18n?.zhHans?.value).toBe(
      'Translated value',
    )
  })

  it.each(['project', 'organisation', 'hub'])(
    'sorts %s options and preserves their identities and translations',
    scope => {
      const values = [
        { id: 'whatsapp', rank: 0, value: 'WhatsApp' },
        { id: 'call', rank: 1, value: 'Call' },
        { id: 'email', rank: 2, value: 'Email' },
      ].map(value => ({
        ...value,
        i18n: {
          en: { value: value.value },
          zhHant: { value: `translated-${value.id}` },
        },
      }))
      const { form, getData } = createForm({
        properties: [{ id: 'property-1', scope, values }],
      })
      sortProjectPropertyValuesAlphabetically(form as never, 'property-1', 'en')
      expect(
        getData().properties[0].values.map(({ id, rank }) => ({ id, rank })),
      ).toEqual([
        { id: 'call', rank: 0 },
        { id: 'email', rank: 1 },
        { id: 'whatsapp', rank: 2 },
      ])
      expect(
        getData().properties[0].values.map(value => value.i18n.zhHant.value),
      ).toEqual(['translated-call', 'translated-email', 'translated-whatsapp'])
    },
  )

  it('normalizes both Chinese locale keys when translating labels and placeholders', async () => {
    translateTextMock.mockResolvedValue(['设施', '请选择'])
    const { form, getData } = createForm({
      properties: [
        {
          id: 'property-1',
          i18n: {
            zhHant: { label: '設施', placeholder: '請選擇' },
            zhHans: { label: '', placeholder: '' },
          },
          values: [],
        },
      ],
    })
    expect(
      await translateProjectPropertyLocale(
        form as never,
        'property-1',
        'zh-hant',
        'zh-hans',
      ),
    ).toBe(true)
    expect(translateTextMock).toHaveBeenCalledWith({
      source: 'zhHant',
      target: 'zhHans',
      texts: ['設施', '請選擇'],
    })
    expect(getData().properties[0].i18n.zhHans).toEqual({
      label: '设施',
      placeholder: '请选择',
      labelGen: true,
      placeholderGen: true,
    })
  })

  it('resets property value locale rows to empty strings', () => {
    const { form, getData } = createForm({
      properties: [
        {
          id: 'property-1',
          key: 'amenity',
          type: 'classifier',
          scope: 'project',
          component: 'SelectField',
          rank: 0,
          isTranslatable: true,
          i18n: {
            en: { locale: 'en', label: 'Amenity', placeholder: 'Choose one' },
            zhHans: {
              locale: 'zh-hans',
              label: '设施',
              placeholder: '请选择',
            },
            zhHant: {
              locale: 'zh-hant',
              label: '設施',
              placeholder: '請選擇',
            },
          },
          values: [
            {
              id: 'value-1',
              propertyId: 'property-1',
              rank: 0,
              value: '',
              i18n: {
                en: {
                  locale: 'en',
                  propertyValueId: 'value-1',
                  value: 'Cafe',
                  valueGen: false,
                },
                zhHans: {
                  locale: 'zh-hans',
                  propertyValueId: 'value-1',
                  value: '咖啡馆',
                  valueGen: false,
                },
                zhHant: {
                  locale: 'zh-hant',
                  propertyValueId: 'value-1',
                  value: '咖啡館',
                  valueGen: false,
                },
              },
            },
          ],
        },
      ],
    })

    resetProjectPropertyLocale(form as never, 'property-1', 'zh-hans')

    expect(getData().properties[0]?.i18n?.zhHans?.label).toBe('')
    expect(getData().properties[0]?.i18n?.zhHans?.placeholder).toBe('')
    expect(getData().properties[0]?.values?.[0]?.i18n?.zhHans?.value).toBe('')
  })
})

describe('scoped property translations', () => {
  beforeEach(() => translateTextMock.mockReset())
  it.each([
    { origin: { type: 'label' } as const, source: 'Name' },
    { origin: { type: 'placeholder' } as const, source: 'Choose' },
    { origin: { type: 'value', valueId: 'first' } as const, source: 'First' },
  ])('translates only the requested $origin.type cell', async ({ origin, source }) => {
    translateTextMock.mockResolvedValue(['Generated'])
    const { form, getData } = createForm({
      properties: [
        {
          id: 'scoped',
          isTranslatable: true,
          i18n: {
            en: { label: 'Name', placeholder: 'Choose' },
            zhHans: { label: '', placeholder: '' },
          },
          values: [
            { id: 'first', i18n: { en: { value: 'First' }, zhHans: { value: '' } } },
            { id: 'second', i18n: { en: { value: 'Second' }, zhHans: { value: '' } } },
          ],
        },
      ],
    })
    expect(
      await translateProjectPropertyLocale(
        form as never,
        'scoped',
        'en',
        'zh-Hans',
        origin,
      ),
    ).toBe(true)
    expect(translateTextMock).toHaveBeenCalledWith({
      source: 'en',
      target: 'zhHans',
      texts: [source],
    })
    const property = getData().properties[0]
    expect(property.i18n.zhHans.label).toBe(origin.type === 'label' ? 'Generated' : '')
    expect(property.i18n.zhHans.placeholder).toBe(
      origin.type === 'placeholder' ? 'Generated' : '',
    )
    expect(property.values[0].i18n.zhHans.value).toBe(
      origin.type === 'value' ? 'Generated' : '',
    )
    expect(property.values[1].i18n.zhHans.value).toBe('')
  })
  it('translates an option language even when the definition has no matching language bucket', async () => {
    translateTextMock.mockResolvedValue(['Generated'])
    const { form, getData } = createForm({
      properties: [
        {
          id: 'scoped',
          isTranslatable: true,
          i18n: { en: { label: 'Name' } },
          values: [{ id: 'first', i18n: { ja: { value: '最初' } } }],
        },
      ],
    })
    expect(
      await translateProjectPropertyLocale(form as never, 'scoped', 'ja', 'zh-Hant', {
        type: 'value',
        valueId: 'first',
      }),
    ).toBe(true)
    expect(translateTextMock).toHaveBeenCalledWith({
      source: 'ja',
      target: 'zhHant',
      texts: ['最初'],
    })
    expect(getData().properties[0].values[0].i18n).toMatchObject({
      zhHant: { value: 'Generated', valueGen: true },
    })
    expect(getData().properties[0].i18n).toEqual({ en: { label: 'Name' } })
  })
})
