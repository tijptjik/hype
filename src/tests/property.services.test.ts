import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetProjectPropertyLocale,
  translateProjectPropertyLocale,
} from '$lib/client/services/property'

const { translateTextMock } = vi.hoisted(() => ({
  translateTextMock: vi.fn(),
}))

vi.mock('$lib/api/server/translation.remote', () => ({
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
      target: 'zh-hans',
      texts: ['Cafe'],
    })
    expect(getData().properties[0]?.values?.[0]?.i18n?.zhHans?.value).toBe(
      'Translated value',
    )
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
