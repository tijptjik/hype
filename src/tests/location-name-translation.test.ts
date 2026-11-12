// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import Names from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
import AddressDisplay from '#lib/bits/patterns/forms/formFeatureAddress/AddressDisplayField.svelte'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
const mocks = vi.hoisted(() => ({ translate: vi.fn(), translateName: vi.fn() }))
vi.mock('#lib/i18n.js', async original => ({
  ...(await original<typeof import('#lib/i18n.js')>()),
  translateText: mocks.translate,
}))
vi.mock('#lib/api/translation.remote.js', () => ({
  translateContentField: mocks.translateName,
}))
const localeState = {
  selectedLocales: normalizeContentLocales(['en', 'zh-Hant']),
  visibleLocales: normalizeContentLocales(['en', 'zh-Hant']),
  expanded: true,
}
beforeEach(() => {
  vi.useRealTimers()
  mocks.translate.mockReset()
  mocks.translateName.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
vi.mock('#lib/addresses/nameCatalogue.js', async original => ({
  ...(await original<object>()),
  loadAddressNames: async () => [],
}))
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionContext: async () => ({
    available: true,
    memberships: [],
    options: [],
  }),
}))

it('offers translation from populated names and fills only the chosen empty locale', async () => {
  mocks.translateName.mockResolvedValue({
    status: 'translated',
    source: 'en',
    target: 'zh-Hant',
    text: '麵包店',
  })
  const onChange = vi.fn()
  render(Names, {
    names: { en: 'Bakery' },
    kind: 'establishment',
    localeState,
    translations: true,
    isEditing: true,
    onChange,
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Bakery' }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'from en' }))
  await waitFor(() =>
    expect(mocks.translateName).toHaveBeenCalledWith({
      source: 'en',
      target: 'zh-Hant',
      text: 'Bakery',
    }),
  )
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({ en: 'Bakery', 'zh-Hant': '麵包店' }),
  )
})

it('does not overwrite a name edited while translation is pending', async () => {
  let resolve!: (value: { status: string; text: string }) => void
  mocks.translateName.mockReturnValue(
    new Promise(done => {
      resolve = done
    }),
  )
  const onChange = vi.fn()
  const view = render(Names, {
    names: { en: 'Bakery' },
    kind: 'building',
    localeState,
    translations: true,
    isEditing: true,
    onChange,
  })
  await fireEvent.click(screen.getByRole('button', { name: 'from en' }))
  await waitFor(() => expect(mocks.translateName).toHaveBeenCalledOnce())
  await view.rerender({ names: { en: 'Bakery', 'zh-hant': '手動名稱' } })
  resolve({ status: 'translated', text: '麵包店' })
  await new Promise(done => setTimeout(done, 0))
  expect(onChange).not.toHaveBeenCalled()
})

it('offers translation for an explicitly empty display address', async () => {
  const address = emptyFeatureAddress()
  address.overrides = {
    en: { formattedAddress: '12 Test Road' },
    'zh-hans': { formattedAddress: '' },
  }
  mocks.translate.mockResolvedValue(['测试道12号'])
  const onChange = vi.fn()
  render(AddressDisplay, {
    address,
    locale: 'zhHans',
    isEditing: true,
    showLocale: true,
    onChange,
  })
  await fireEvent.click(
    screen.getByRole('button', { name: 'Translate from en to zh-hans' }),
  )
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  expect(onChange.mock.lastCall?.[0].overrides['zh-hans'].formattedAddress).toBe(
    '测试道12号',
  )
})

it.each(['unmount', 'readonly', 'replacement'] as const)(
  'ignores building-name translation after %s',
  async transition => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }))
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const Fixture = (
      await import('./fixtures/components/AddressTranslationFixture.svelte')
    ).default
    let finish!: (value: string[]) => void
    mocks.translate.mockReturnValue(
      new Promise(resolve => {
        finish = resolve
      }),
    )
    const address = emptyFeatureAddress()
    address.overrides = {
      en: { buildingName: 'Test Building' },
      'zh-hant': { buildingName: '' },
      'zh-hans': { buildingName: '' },
    }
    const onChange = vi.fn()
    const view = render(Fixture, { address, onChange })
    const building = view.container.querySelector<HTMLElement>(
      '[data-address-group="buildingName"]',
    )
    if (!building) throw new Error('Building fields were not rendered')
    await fireEvent.click(
      within(building).getByRole('button', {
        name: 'Translate from en to zh-hant',
      }),
    )
    await waitFor(() => expect(mocks.translate).toHaveBeenCalledOnce())
    if (transition === 'unmount') view.unmount()
    else if (transition === 'readonly') await view.rerender({ isEditing: false })
    else await view.rerender({ address: structuredClone(address) })
    finish(['Translated building'])
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onChange).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  },
)

it.each(['locale', 'reopened'] as const)(
  'rejects pending display translation after %s changes',
  async change => {
    let finish!: (value: string[]) => void
    mocks.translate.mockReturnValue(
      new Promise(resolve => {
        finish = resolve
      }),
    )
    const address = emptyFeatureAddress()
    address.overrides = {
      en: { formattedAddress: '12 Test Road' },
      'zh-hans': { formattedAddress: '' },
      'zh-hant': { formattedAddress: '' },
    }
    const onChange = vi.fn()
    const view = render(AddressDisplay, {
      address,
      locale: 'zhHans',
      isEditing: true,
      showLocale: true,
      onChange,
    })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Translate from en to zh-hans' }),
    )
    await waitFor(() => expect(mocks.translate).toHaveBeenCalledOnce())
    if (change === 'locale') await view.rerender({ locale: 'zhHant' })
    else {
      await view.rerender({ isEditing: false })
      await view.rerender({ isEditing: true })
    }
    finish(['测试道12号'])
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onChange).not.toHaveBeenCalled()
  },
)
