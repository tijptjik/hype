// @vitest-environment jsdom
import {
  render,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/AddressDetailsFixture.svelte'
import FormFixture from './fixtures/components/FeatureAddress3dFixture.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { structurePlaceAddress, setAddressName } from '#lib/addresses/nameCatalogue.js'
vi.mock('#lib/i18n.js', async original => ({
  ...(await original<object>()),
  translateText: async (_source: string, target: string, values: string[]) =>
    values.map(value => `${target}: ${value}`),
}))
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionContext: () =>
    Promise.resolve({ available: true, memberships: [], options: [] }),
}))
vi.mock('#lib/addresses/nameCatalogue.js', async original => ({
  ...(await original<object>()),
  loadAddressNames: async () => [
    {
      id: 'street',
      names: { en: 'LYNDHURST TERRACE', 'zh-Hant': '擺花街' },
      divisionCodes: ['CW'],
    },
  ],
}))
beforeEach(() => {
  vi.useRealTimers()
  // JSDOM has no animation engine; real-browser checks exercise both directions.
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
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('always exposes the display address, unlocks custom text and regenerates on relock', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  const display = view.getByRole('textbox', {
    name: 'Display address',
  }) as HTMLInputElement
  expect(display.readOnly).toBe(true)
  expect(display.value).toBe('25 Lyndhurst Terrace')
  await fireEvent.click(
    view.getByRole('button', { name: 'Write a custom display address' }),
  )
  expect(display.readOnly).toBe(false)
  await fireEvent.input(display, { target: { value: 'Custom entrance' } })
  expect(display.value).toBe('Custom entrance')
  await fireEvent.click(
    within(display.closest('fieldset')!).getByRole('button', { name: 'Use source' }),
  )
  expect(display.value).toBe('25 Lyndhurst Terrace')
  expect(display.readOnly).toBe(true)
})
it('selects a controlled street rather than accepting the search text as an address', async () => {
  const view = render(Fixture, { initialAddress: emptyFeatureAddress() })
  await fireEvent.click(view.getByRole('button', { name: 'Street name' }))
  const search = view.getByRole('combobox', { name: 'Street name' })
  await fireEvent.focus(search)
  await fireEvent.input(search, { target: { value: 'Invented street' } })
  expect(
    (view.getByRole('textbox', { name: 'Display address' }) as HTMLInputElement).value,
  ).toBe('')
  await fireEvent.input(search, { target: { value: 'Lyndhurst' } })
  await fireEvent.click(await view.findByRole('option', { name: /Lyndhurst Terrace/ }))
  expect(
    (view.getByRole('textbox', { name: 'Display address' }) as HTMLInputElement).value,
  ).toBe('Lyndhurst Terrace')
})

it('shows the selected name as a tile and restores it when replacement is cancelled', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  expect(view.queryByRole('combobox', { name: 'Street name' })).toBeNull()
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' }),
  )
  let input = view.getByRole('combobox', { name: 'Street name' }) as HTMLInputElement
  expect(input.value).toBe('')
  const streetField = input.closest('fieldset')!
  expect(within(streetField).queryByRole('button', { name: 'Use source' })).toBeNull()
  await fireEvent.input(input, { target: { value: 'Uncommitted replacement' } })
  await fireEvent.click(view.getByRole('button', { name: 'Cancel' }))
  expect(within(streetField).getByRole('button', { name: 'Clear' })).toBeTruthy()
  expect(view.queryByRole('combobox', { name: 'Street name' })).toBeNull()
  expect(view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeTruthy()
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' }),
  )
  input = view.getByRole('combobox', { name: 'Street name' }) as HTMLInputElement
  await fireEvent.input(input, { target: { value: 'Another draft' } })
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeTruthy()
  expect(
    (view.getByRole('textbox', { name: 'Display address' }) as HTMLInputElement).value,
  ).toBe('25 Lyndhurst Terrace')
})

it('keeps the toolbar display and translations synchronized with address component edits', async () => {
  const view = render(FormFixture, {
    displayAddressInToolbar: true,
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [
        {
          id: 'street',
          names: { en: 'LYNDHURST TERRACE', 'zh-Hant': '擺花街' },
          divisionCodes: ['CW'],
        },
      ],
    ),
  })
  const display = view.container.querySelector('[data-address-toolbar-display]')!
  expect(view.queryByText('Display address', { selector: 'label' })).toBeNull()
  expect(view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeTruthy()
  expect(view.queryByText('Shared across languages')).toBeNull()
  expect(view.queryByText('For example: 25, 25A, 25–27.')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Multilingual' }))
  expect(view.queryByRole('textbox', { name: 'Display address · zh-hant' })).toBeNull()
  await fireEvent.click(
    within(
      view.getByText('Display address', { selector: 'legend' }).closest('fieldset')!,
    ).getAllByRole('button', { name: 'Write a custom display address' })[0],
  )
  const translated = view.getByRole('textbox', {
    name: 'Display address · zh-hant',
  }) as HTMLTextAreaElement
  expect(translated.readOnly).toBe(false)
  await fireEvent.input(translated, { target: { value: '自訂地址' } })
  expect(translated.value).toBe('自訂地址')
  expect(view.getByRole('button', { name: 'Replace: 擺花街' })).toBeTruthy()
  await fireEvent.input(view.getByRole('textbox', { name: 'Street number' }), {
    target: { value: '57' },
  })
  expect(display.textContent).toContain('57 Lyndhurst Terrace')
})

it('tabs directly to the first street result while keeping Cancel before it in keyboard order', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' }),
  )
  const input = view.getByRole('combobox', { name: 'Street name' })
  await fireEvent.input(input, { target: { value: 'Lyndhurst' } })
  const option = await view.findByRole('option', { name: /Lyndhurst Terrace/ })
  await fireEvent.keyDown(input, { key: 'Tab' })
  await waitFor(() => expect(document.activeElement).toBe(option))
  const cancel = view.getByRole('button', { name: 'Cancel' })
  expect(
    cancel.compareDocumentPosition(option) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(cancel.className).toContain('focus-visible:outline')
  await fireEvent.keyDown(option, { key: 'Enter' })
  expect(view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeTruthy()
})

it('hides coordinate and secondary lookup after accepting a result even when unresolved', () => {
  const onLookup = vi.fn()
  const view = render(FormFixture, {
    displayAddressInToolbar: true,
    showLookup: true,
    onLookup,
  })
  expect(view.queryByRole('textbox', { name: 'Look up address' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Get address for location' })).toBeNull()
  expect(onLookup).not.toHaveBeenCalled()
})

it('hides marker address lookup after an address is resolved', () => {
  const initialAddress = emptyFeatureAddress({ en: '25 Lyndhurst Terrace' })
  initialAddress.matchStatus = 'resolved'
  initialAddress.source.status = 'resolved'
  initialAddress.source.address2dId = 'address-25'
  const view = render(FormFixture, { displayAddressInToolbar: true, initialAddress })
  expect(view.queryByRole('button', { name: 'Get address for location' })).toBeNull()
})

it('places address additions before the Location editor and Division column', async () => {
  const view = render(FormFixture, { displayAddressInToolbar: true })
  expect(
    view.getAllByRole('heading', { level: 2 }).map(node => node.textContent),
  ).toEqual(['Address', 'Location', 'Divisions'])
  const additions = view.container.querySelector('[data-address-additions]')!
  expect(additions).toHaveTextContent('Add parts')
  const editor = view.container.querySelector('[data-address-details]')!
  const addUnit = view.getByRole('button', { name: 'Unit' })
  expect(additions.contains(addUnit)).toBe(true)
  await fireEvent.click(addUnit)
  expect(editor.querySelector('#address-en-unitExpression')).toBeTruthy()
  expect(additions.querySelector('#address-en-unitExpression')).toBeNull()
})

it('keeps street fields together on their own row when only unit portion is added', async () => {
  const view = render(FormFixture, {
    displayAddressInToolbar: true,
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  await fireEvent.click(view.getByRole('button', { name: 'Part' }))
  const portion = view.getByRole('textbox', { name: 'Part' })
  const number = view.getByRole('textbox', { name: 'Street number' })
  const street = view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })
  expect(number.closest('[data-address-field-row]')).toBe(
    street.closest('[data-address-field-row]'),
  )
  expect(portion.closest('[data-address-field-row]')).not.toBe(
    number.closest('[data-address-field-row]'),
  )
  expect(number.getAttribute('placeholder')).toBe('25, 25A, 25–27')
})

it('collapses the empty parts tray and restores it when an added part is reset', async () => {
  const view = render(FormFixture, { displayAddressInToolbar: true })
  const tray = view.container.querySelector('[data-address-additions]')!
  while (tray.querySelector('fieldset button'))
    await fireEvent.click(tray.querySelector('fieldset button')!)
  await waitFor(() => expect(tray.parentElement).toHaveAttribute('aria-hidden', 'true'))
  const unit = view.container
    .querySelector('#address-en-unitExpression')!
    .closest('fieldset')!
  await fireEvent.click(within(unit).getByRole('button', { name: 'Use source' }))
  await waitFor(() =>
    expect(tray.parentElement).toHaveAttribute('aria-hidden', 'false'),
  )
  expect(within(tray as HTMLElement).getByRole('button', { name: 'Unit' })).toBeTruthy()
})

it('keeps actions beside the label and clears an active block reference before offering reset', async () => {
  const view = render(FormFixture, { displayAddressInToolbar: true })
  await fireEvent.click(view.getByRole('button', { name: 'Block' }))
  const input = view.container.querySelector(
    '#address-en-blockExpression',
  ) as HTMLInputElement
  const field = input.closest('fieldset')!
  expect(
    within(field).getByRole('button', { name: 'Use source' }).closest('legend'),
  ).toBeTruthy()
  await fireEvent.focus(input)
  await fireEvent.input(input, { target: { value: 'A' } })
  expect(within(field).queryByRole('button', { name: 'Use source' })).toBeNull()
  expect(
    within(field).getByRole('button', { name: 'Clear' }).closest('legend'),
  ).toBeTruthy()
  await fireEvent.blur(input)
  expect(within(field).getByRole('button', { name: 'Use source' })).toBeTruthy()
  await fireEvent.focus(input)
  await fireEvent.click(within(field).getByRole('button', { name: 'Clear' }))
  expect(input.value).toBe('')
  expect(within(field).getByRole('button', { name: 'Use source' })).toBeTruthy()
  expect(view.getByRole('combobox', { name: 'Block type' })).toHaveTextContent('Block')
})

it('returns an empty building editor to the parts tray', async () => {
  const view = render(FormFixture, { displayAddressInToolbar: true })
  await fireEvent.click(view.getByRole('button', { name: 'Building name' }))
  const input = view.getByRole('combobox', { name: 'Building name' })
  await fireEvent.focus(input)
  await fireEvent.click(
    within(input.closest('fieldset')!).getByRole('button', { name: 'Use source' }),
  )
  expect(view.queryByRole('combobox', { name: 'Building name' })).toBeNull()
  expect(view.getByRole('button', { name: 'Building name' })).toBeTruthy()
})

it('extracts a typed floor term on blur and explains the selected type', async () => {
  const view = render(FormFixture, { displayAddressInToolbar: true })
  await fireEvent.click(view.getByRole('button', { name: 'Level' }))
  const input = view.getByRole('textbox', { name: 'Level' }) as HTMLInputElement
  expect(input.placeholder).toBe('1, 88')
  await fireEvent.input(input, { target: { value: 'Basement 2' } })
  await fireEvent.blur(input)
  expect(input.value).toBe('2')
  expect(view.getByRole('combobox', { name: 'Floor type' })).toHaveTextContent(
    'Basement',
  )
  expect(
    view.getByLabelText('Selected Basement and kept only the reference here.'),
  ).toBeTruthy()
})

it('returns a populated source street to the tray without restoring its source text', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  const tile = view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })
  await fireEvent.click(
    within(tile.closest('fieldset')!).getByRole('button', { name: 'Clear' }),
  )
  expect(view.queryByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeNull()
  expect(view.getByRole('button', { name: 'Street name' })).toBeTruthy()
})

it('restores the establishment street after clearing its selection', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  const field = view
    .getByRole('button', { name: 'Replace: Lyndhurst Terrace' })
    .closest('fieldset')!
  await fireEvent.click(within(field).getByRole('button', { name: 'Clear' }))
  await fireEvent.click(view.getByRole('button', { name: 'Street name' }))
  const restoredField = view
    .getByRole('combobox', { name: 'Street name' })
    .closest('fieldset')!
  await fireEvent.click(
    within(restoredField).getByRole('button', { name: 'Use source' }),
  )
  expect(view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeTruthy()
  expect(view.queryByRole('combobox', { name: 'Street name' })).toBeNull()
})

it('keeps the street-number action visible and restores the establishment number', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  const input = view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement
  const field = input.closest('fieldset')!
  expect(
    within(field).getByRole('button', { name: 'Clear' }).closest('legend'),
  ).toBeTruthy()
  await fireEvent.input(input, { target: { value: '18' } })
  await fireEvent.click(within(field).getByRole('button', { name: 'Use source' }))
  expect(input.value).toBe('25')
})

it('offers explicit pin lookup for a building without a street address', async () => {
  const address = emptyFeatureAddress()
  address.source.rawSource = {
    data: { attributes: { i18n: { en: { buildingName: 'Martin Hostel' } } } },
  }
  const onLookup = vi.fn()
  const view = render(FormFixture, {
    initialAddress: address,
    displayAddressInToolbar: true,
    onLookup,
  })
  const field = view
    .getByRole('button', { name: 'Replace: Martin Hostel' })
    .closest('fieldset')!
  expect(within(field).getByRole('button', { name: 'Clear' })).toBeTruthy()
  await fireEvent.click(view.getByRole('button', { name: 'Lookup Address' }))
  expect(onLookup).toHaveBeenCalledWith()
  expect(view.getByRole('button', { name: 'Replace: Martin Hostel' })).toBeTruthy()
})
it('does not offer missing-address lookup once a street is present', () => {
  const address = emptyFeatureAddress()
  address.source.rawSource = {
    data: {
      attributes: {
        i18n: { en: { buildingName: 'Martin Hostel', streetName: 'Sha Kok Street' } },
      },
    },
  }
  const view = render(FormFixture, {
    initialAddress: address,
    displayAddressInToolbar: true,
  })
  expect(view.queryByRole('button', { name: 'Lookup Address' })).toBeNull()
})

it('marks Multilingual when another locale has a custom override', () => {
  const address = emptyFeatureAddress()
  address.overrides['zh-hant'] = { buildingName: '自訂名稱' }
  const view = render(Fixture, { initialAddress: address })
  expect(
    view.getByRole('button', { name: /Multilingual/ }).getAttribute('data-tooltip'),
  ).toBe('Custom overrides in another language')
})

it('does not mark Multilingual for an unchanged unlocked source display', () => {
  const address = emptyFeatureAddress()
  address.source.rawSource = {
    data: { attributes: { i18n: { 'zh-hant': { formattedAddress: '赤柱' } } } },
  }
  address.overrides['zh-hant'] = { formattedAddress: '赤柱' }
  const view = render(Fixture, { initialAddress: address })
  expect(
    view.getByRole('button', { name: 'Multilingual' }).getAttribute('data-tooltip'),
  ).toBeNull()
})

it('shows the Chinese street in the picker when a catalogue override copied English', async () => {
  const address = emptyFeatureAddress()
  address.overrides = {
    en: { streetName: 'Hing Fong Road' },
    'zh-hant': { streetName: 'HING FONG ROAD' },
    'zh-hans': { streetName: '兴芳路' },
  }
  const view = render(Fixture, { initialAddress: address })
  await fireEvent.click(view.getByRole('button', { name: /Multilingual/ }))
  expect(view.getByRole('button', { name: 'Replace: 興芳路' })).toBeTruthy()
  expect(view.queryByRole('button', { name: 'Replace: HING FONG ROAD' })).toBeNull()
})

it('shows a warning after retained translations when the new name has no translations', async () => {
  let address = emptyFeatureAddress()
  address.overrides = {
    'zh-hant': { buildingName: '馬田宿舍' },
    'zh-hans': { buildingName: '马丁宿舍' },
  }
  address = setAddressName(address, 'buildingName', {
    id: 'martin',
    names: { en: 'Martin Hostel' },
    divisionCodes: [],
  })
  const view = render(Fixture, { initialAddress: address })
  await fireEvent.click(view.getByRole('button', { name: /Multilingual/ }))
  expect(view.getByRole('button', { name: 'Replace: 馬田宿舍' })).toBeTruthy()
  expect(view.getByRole('button', { name: 'Replace: 马丁宿舍' })).toBeTruthy()
  expect(
    view.getAllByLabelText(
      'Kept from the previous selection. The new selection has no name in this language. Check this name.',
    ),
  ).toHaveLength(2)
})

it('shows the inherited Chinese block reference and synchronizes edits in either script', async () => {
  const address = emptyFeatureAddress()
  address.source.rawSource = {
    data: {
      attributes: { i18n: { 'zh-hant': { blockRef: '2', blockType: 'block' } } },
    },
  }
  const view = render(Fixture, { initialAddress: address })
  await fireEvent.click(view.getByRole('button', { name: 'Multilingual' }))
  const traditional = view.container.querySelector(
    '#address-zhHant-blockExpression',
  ) as HTMLInputElement
  const simplified = view.container.querySelector(
    '#address-zhHans-blockExpression',
  ) as HTMLInputElement
  expect(traditional.value).toBe('2')
  expect(simplified.value).toBe('2')
  await fireEvent.input(traditional, { target: { value: '3' } })
  await fireEvent.blur(traditional)
  expect(simplified.value).toBe('3')
  await fireEvent.input(simplified, { target: { value: '4' } })
  await fireEvent.blur(simplified)
  expect(traditional.value).toBe('4')
})

it('fills a map number on add and dismisses its caveat without clearing the number', async () => {
  const lookup = vi.fn(async () => '71')
  const view = render(Fixture, {
    initialAddress: emptyFeatureAddress(),
    onSuggestStreetNumber: lookup,
  })
  expect(lookup).not.toHaveBeenCalled()
  await fireEvent.click(view.getByRole('button', { name: 'Street number' }))
  const input = view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement
  await waitFor(() => expect(input.value).toBe('71'))
  await fireEvent.click(
    view.getByRole('button', { name: 'Dismiss map suggestion note' }),
  )
  expect(input.value).toBe('71')
  expect(view.queryByText(/Inferred from the map/)).toBeNull()
})

it('does not overwrite typing while the map lookup is pending', async () => {
  let resolve!: (value: string | null) => void
  const lookup = () =>
    new Promise<string | null>(done => {
      resolve = done
    })
  const view = render(Fixture, {
    initialAddress: emptyFeatureAddress(),
    onSuggestStreetNumber: lookup,
  })
  await fireEvent.click(view.getByRole('button', { name: 'Street number' }))
  const input = view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement
  await fireEvent.input(input, { target: { value: '72' } })
  resolve('71')
  await new Promise(done => setTimeout(done, 0))
  expect(input.value).toBe('72')
  expect(view.queryByText(/Inferred from the map/)).toBeNull()
})

it('ignores a suggestion after changing the pin', async () => {
  let resolve!: (value: string | null) => void
  const view = render(Fixture, {
    initialAddress: emptyFeatureAddress(),
    suggestionKey: 'old',
    onSuggestStreetNumber: () =>
      new Promise<string | null>(done => {
        resolve = done
      }),
  })
  await fireEvent.click(view.getByRole('button', { name: 'Street number' }))
  await view.rerender({ suggestionKey: 'new' })
  resolve('71')
  await new Promise(done => setTimeout(done, 0))
  expect(
    (view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement).value,
  ).toBe('')
})

it.each([false, true])(
  'keeps the number manually editable when map evidence is unavailable (error: %s)',
  async fail => {
    const view = render(Fixture, {
      initialAddress: emptyFeatureAddress(),
      onSuggestStreetNumber: async () => {
        if (fail) throw new Error('Tiles unavailable')
        return null
      },
    })
    await fireEvent.click(view.getByRole('button', { name: 'Street number' }))
    const input = view.getByRole('textbox', {
      name: 'Street number',
    }) as HTMLInputElement
    expect(input.value).toBe('')
    await fireEvent.input(input, { target: { value: '71A' } })
    expect(input.value).toBe('71A')
    expect(view.queryByText(/Inferred from the map/)).toBeNull()
  },
)

it.each(['', '71'])(
  'offers enrichment for Pretty Garden with number %s and no street',
  async number => {
    const address = emptyFeatureAddress()
    address.overrides.en = {
      premisesName: 'Pretty Garden',
      buildingNumberExpression: number,
    }
    // A matched place/address can still have incomplete structured street fields.
    address.source.address2dId = 'pretty-garden'
    const onLookup = vi.fn()
    const view = render(FormFixture, {
      initialAddress: address,
      displayAddressInToolbar: true,
      onLookup,
    })
    await fireEvent.click(view.getByRole('button', { name: 'Lookup Address' }))
    expect(onLookup).toHaveBeenCalledWith()
    expect(
      (view.getByRole('textbox', { name: 'Complex name' }) as HTMLInputElement).value,
    ).toBe('Pretty Garden')
  },
)

it('looks for nearby streets when adding the street-name part', async () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    premisesName: 'Pretty Garden',
    buildingNumberExpression: '71',
  }
  const onLookup = vi.fn()
  const view = render(FormFixture, {
    initialAddress: address,
    displayAddressInToolbar: true,
    onLookup,
  })
  await fireEvent.click(view.getByRole('button', { name: 'Street name' }))
  expect(onLookup).toHaveBeenCalledExactlyOnceWith()
  expect(view.getByRole('combobox', { name: 'Street name' })).toBeTruthy()
  expect(
    (view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement).value,
  ).toBe('71')
})

it('keeps the lookup label stable and swaps the search icon for a spinner while loading', async () => {
  const view = render(FormFixture, {
    initialAddress: emptyFeatureAddress(),
    displayAddressInToolbar: true,
  })
  const button = view.getByRole('button', { name: 'Lookup Address' })
  expect(button.getAttribute('aria-busy')).toBe('false')
  await view.rerender({ isLoading: true })
  expect(button.textContent?.trim()).toBe('Lookup Address')
  expect(button.getAttribute('aria-busy')).toBe('true')
  expect(button).toBeDisabled()
})

it('previews numbered address rows on hover and focus, restoring the Location on leave', async () => {
  const candidate = emptyFeatureAddress({ en: 'Pretty Garden, 75' })
  const onPreviewCandidate = vi.fn()
  const view = render(FormFixture, { candidates: [candidate], onPreviewCandidate })
  const row = view.getByRole('button', { name: /1 Pretty Garden, 75.*Use address/ })
  await fireEvent.mouseEnter(row)
  expect(onPreviewCandidate).toHaveBeenLastCalledWith(candidate)
  await fireEvent.mouseLeave(row)
  expect(onPreviewCandidate).toHaveBeenLastCalledWith(null)
  await fireEvent.focus(row)
  expect(onPreviewCandidate).toHaveBeenLastCalledWith(candidate)
  await fireEvent.blur(row)
  expect(onPreviewCandidate).toHaveBeenLastCalledWith(null)
})

it('translates empty Part languages from the single control beside its heading', async () => {
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides.en = { unitPortion: 'Backdoor' }
  const view = render(FormFixture, {
    initialAddress,
    translations: true,
    displayAddressInToolbar: true,
  })
  const heading = view
    .getByText('Part', { selector: 'legend > span' })
    .closest('legend')
  if (!heading) throw new Error('Missing Part heading')
  const source = within(heading).getByRole('button', {
    name: 'Translate from en to zh-hant',
  })
  expect(source.closest('legend')).toHaveTextContent('Part')
  expect(
    within(heading).queryByRole('button', { name: 'Translate from en to zh-hans' }),
  ).toBeNull()
  await fireEvent.click(source)
  await waitFor(() => {
    expect(view.getByDisplayValue('zh-hant: Backdoor')).toBeInTheDocument()
    expect(view.getByDisplayValue('zh-hans: Backdoor')).toBeInTheDocument()
  })
  expect(view.getByDisplayValue('Backdoor')).toBeInTheDocument()
})
