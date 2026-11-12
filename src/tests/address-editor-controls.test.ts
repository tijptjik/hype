// @vitest-environment jsdom
import {
  render,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import { createRawSnippet } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/AddressDetailsFixture.svelte'
import FormFixture from './fixtures/components/FeatureAddress3dFixture.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import * as nameCatalogue from '#lib/addresses/nameCatalogue.js'
import { structurePlaceAddress, setAddressName } from '#lib/addresses/nameCatalogue.js'
vi.mock('#lib/addresses/nameSuggestions.js', () => ({
  fetchNameSuggestions: async () => [
    {
      id: 'street',
      names: { en: 'LYNDHURST TERRACE', 'zh-Hant': '擺花街' },
      divisionCodes: [],
    },
  ],
}))
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
  expect(
    within(streetField).getByRole('button', { name: 'Clear: Street name' }),
  ).toBeTruthy()
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

it.each([false, true])(
  'collapses the empty parts tray and restores it when an added part is reset (associated: %s)',
  async associated => {
    const initialAddress = emptyFeatureAddress()
    if (associated)
      initialAddress.association = {
        originKind: 'building',
        kind: 'establishment',
        mode: 'linked',
        lookup: 'matched',
        names: { en: 'Test building' },
      }
    const view = render(FormFixture, { displayAddressInToolbar: true, initialAddress })
    const tray = view.container.querySelector('[data-address-additions]')!
    while (tray.querySelector('fieldset button'))
      await fireEvent.click(tray.querySelector('fieldset button')!)
    await waitFor(() =>
      expect(tray.parentElement).toHaveAttribute('aria-hidden', 'true'),
    )
    const unit = view.container
      .querySelector('#address-en-unitExpression')!
      .closest('fieldset')!
    await fireEvent.click(within(unit).getByRole('button', { name: 'Use source' }))
    await waitFor(() =>
      expect(tray.parentElement).toHaveAttribute('aria-hidden', 'false'),
    )
    expect(
      within(tray as HTMLElement).getByRole('button', { name: 'Unit' }),
    ).toBeTruthy()
  },
)

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

it('dismisses an explicitly added empty building name', async () => {
  const view = render(FormFixture, { displayAddressInToolbar: true })
  await fireEvent.click(view.getByRole('button', { name: 'Building name' }))
  const input = view.getByRole('combobox', { name: 'Building name' })
  await fireEvent.click(
    within(input.closest('fieldset')!).getByRole('button', { name: 'Clear' }),
  )
  expect(view.queryByRole('combobox', { name: 'Building name' })).toBeNull()
  expect(view.getByRole('button', { name: 'Building name' })).toBeTruthy()
})

it('does not preselect a building for an establishment without structured address', () => {
  const view = render(Fixture, {
    initialAddress: emptyFeatureAddress(),
    establishmentIdentity: true,
  })
  expect(view.getByText('Arome - MTR Olympic')).toBeTruthy()
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

it('clears a populated source street while keeping its reset available', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  const tile = view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' })
  await fireEvent.click(
    within(tile.closest('fieldset')!).getByRole('button', {
      name: 'Clear: Street name',
    }),
  )
  expect(view.queryByRole('button', { name: 'Replace: Lyndhurst Terrace' })).toBeNull()
  expect(view.getByRole('combobox', { name: 'Street name' })).toBeTruthy()
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
  await fireEvent.click(
    within(field).getByRole('button', { name: 'Clear: Street name' }),
  )
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

it('keeps building controls without duplicating lookup in the section header', async () => {
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
  expect(
    within(field).getByRole('button', { name: 'Clear: Building name' }),
  ).toBeTruthy()
  expect(within(field).queryByRole('button', { name: 'Use source' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Lookup Address' })).toBeNull()
  expect(onLookup).not.toHaveBeenCalled()
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

it('marks Multilingual when another locale contains text', () => {
  const address = emptyFeatureAddress()
  address.overrides['zh-hant'] = { buildingName: '自訂名稱' }
  const view = render(Fixture, { initialAddress: address })
  expect(
    view.getByRole('button', { name: /Multilingual/ }).querySelector('[role="img"]'),
  ).not.toBeNull()
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

it('shows each street locale as stored instead of converting another locale', async () => {
  const address = emptyFeatureAddress()
  address.overrides = {
    en: { streetName: 'Hing Fong Road' },
    'zh-hant': { streetName: 'HING FONG ROAD' },
    'zh-hans': { streetName: '兴芳路' },
  }
  const view = render(Fixture, { initialAddress: address })
  await fireEvent.click(view.getByRole('button', { name: /Multilingual/ }))
  expect(view.getByRole('button', { name: 'Replace: HING FONG ROAD' })).toBeTruthy()
  expect(view.queryByRole('button', { name: 'Replace: 興芳路' })).toBeNull()
})

it('unsets previous translations when the new building has no translations', async () => {
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
  expect(view.queryByRole('button', { name: 'Replace: 馬田宿舍' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Replace: 马丁宿舍' })).toBeNull()
  expect(
    view.queryAllByLabelText(
      'Kept from the previous selection. The new selection has no name in this language. Check this name.',
    ),
  ).toHaveLength(0)
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
  'does not duplicate lookup for Pretty Garden with number %s and no street',
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
    expect(view.queryByRole('button', { name: 'Lookup Address' })).toBeNull()
    expect(onLookup).not.toHaveBeenCalled()
    expect(
      (view.getByRole('textbox', { name: 'Complex name' }) as HTMLInputElement).value,
    ).toBe('Pretty Garden')
  },
)

it('adds Street name inline and only looks up addresses on explicit request', async () => {
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
  expect(onLookup).not.toHaveBeenCalled()
  expect(view.getByRole('combobox', { name: 'Street name' })).toBeTruthy()
  expect(
    (view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement).value,
  ).toBe('71')
  expect(view.queryByRole('button', { name: 'Lookup Address' })).toBeNull()
  expect(onLookup).not.toHaveBeenCalled()
})

it('shows an empty-state heading and guidance without a lookup header action', () => {
  const view = render(FormFixture, {
    initialAddress: emptyFeatureAddress(),
    displayAddressInToolbar: true,
  })
  expect(
    view.getByRole('heading', { name: 'No structured address available' }),
  ).toBeTruthy()
  expect(
    view.getByText(
      'Use the display address to find a matching location, or search for locations nearby the marker.',
    ),
  ).toBeTruthy()
  expect(view.queryByRole('button', { name: 'Lookup Address' })).toBeNull()
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

it('swaps the block inputs and composed address with the order button', async () => {
  const { setAddressBlock } = await import('#lib/addresses/addressExpressions.js')
  const initialAddress = setAddressBlock(
    emptyFeatureAddress(),
    'en',
    'block',
    'A',
    true,
  )
  const view = render(FormFixture, { initialAddress })
  const swap = view.getByRole('button', { name: 'Type before number' })
  const reference = view.getByRole('textbox', { name: 'Block' })
  const type = () => view.getByRole('combobox', { name: 'Block type' })
  expect(swap).toHaveAttribute('aria-pressed', 'true')
  expect(
    type().compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  await fireEvent.click(swap)
  expect(swap).toHaveAttribute('aria-pressed', 'false')
  expect(
    reference.compareDocumentPosition(type()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(view.getByRole('textbox', { name: 'Display address' })).toHaveValue('A Blk')
  await fireEvent.click(swap)
  expect(swap).toHaveAttribute('aria-pressed', 'true')
  expect(
    type().compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it.each([false, true])(
  'translates empty access hints while preserving existing languages (Chinese filled: %s)',
  async chineseFilled => {
    const initialAddress = emptyFeatureAddress()
    initialAddress.accessHints = {
      en: 'Side entrance',
      ...(chineseFilled ? { 'zh-hant': 'Existing entrance hint' } : {}),
    }
    const view = render(FormFixture, {
      initialAddress,
      translations: true,
      displayAddressInToolbar: true,
    })
    const source = view.getByRole('button', { name: 'Access hints: from EN' })
    expect(source.closest('legend')).toHaveTextContent('Access hints')
    if (chineseFilled)
      expect(
        view.getByRole('button', { name: 'Access hints: from 繁中' }),
      ).toBeInTheDocument()
    await fireEvent.click(source)
    await waitFor(() => {
      expect(
        view.getByDisplayValue(
          chineseFilled ? 'Existing entrance hint' : 'zh-hant: Side entrance',
        ),
      ).toBeInTheDocument()
      expect(view.getByDisplayValue('zh-hans: Side entrance')).toBeInTheDocument()
    })
    expect(view.getByDisplayValue('Side entrance')).toBeInTheDocument()
  },
)

it('clears all street-name languages together', async () => {
  const initialAddress = setAddressName(emptyFeatureAddress(), 'streetName', {
    id: 'hollywood',
    names: { en: 'Hollywood Road', 'zh-hant': '荷李活道' },
    divisionCodes: [],
  })
  const view = render(FormFixture, {
    initialAddress,
    translations: true,
    displayAddressInToolbar: true,
  })
  await fireEvent.click(view.getByRole('button', { name: 'Clear: Street name' }))
  expect(view.queryByRole('button', { name: 'Replace: Hollywood Road' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Replace: 荷李活道' })).toBeNull()
  expect(view.getAllByRole('combobox', { name: 'Street name' })).toHaveLength(3)
})

it('does not load catalogues or invent translations when a name editor mounts', () => {
  const load = vi.spyOn(nameCatalogue, 'loadAddressNames')
  try {
    const initialAddress = emptyFeatureAddress()
    initialAddress.overrides.en = { streetName: 'Lyndhurst Terrace' }
    const view = render(FormFixture, { initialAddress, translations: true })
    expect(
      view.getByRole('button', { name: 'Replace: Lyndhurst Terrace' }),
    ).toBeTruthy()
    expect(view.queryByRole('button', { name: 'Replace: 擺花街' })).toBeNull()
    expect(view.getAllByRole('combobox', { name: 'Street name' })).toHaveLength(2)
    expect(load).not.toHaveBeenCalled()
  } finally {
    load.mockRestore()
  }
})

it('clears every building-name language together', async () => {
  const initialAddress = setAddressName(emptyFeatureAddress(), 'buildingName', {
    id: 'building',
    names: { en: 'Test Building', 'zh-hant': '測試大廈' },
    divisionCodes: [],
  })
  const view = render(FormFixture, { initialAddress, translations: true })
  await fireEvent.click(view.getByRole('button', { name: 'Clear: Building name' }))
  expect(view.queryByRole('button', { name: 'Replace: Test Building' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Replace: 測試大廈' })).toBeNull()
})

it('reorders localized address rows without changing their values', async () => {
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides = {
    en: { unitPortion: 'Side door' },
    'zh-hant': { unitPortion: '側門' },
  }
  const view = render(FormFixture, { initialAddress, translations: true })
  await fireEvent.keyDown(view.getByRole('button', { name: 'Traditional Chinese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  const rows = view.container.querySelectorAll(
    '[data-address-group="unitPortion"] [data-address-locale]',
  )
  expect(
    [...rows].map(row => row.getAttribute('data-address-locale')).slice(0, 3),
  ).toEqual(['zhHant', 'en', 'zhHans'])
  expect(view.container.querySelector('#address-en-unitPortion')).toHaveValue(
    'Side door',
  )
  expect(view.container.querySelector('#address-zhHant-unitPortion')).toHaveValue(
    '側門',
  )
})

it('uses the first ordered locale in the toolbar and leaves the others in the form', async () => {
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides = {
    en: { formattedAddress: 'English address' },
    'zh-hant': { formattedAddress: '繁體地址' },
    'zh-hans': { formattedAddress: '简体地址' },
  }
  const view = render(FormFixture, {
    initialAddress,
    translations: true,
    displayAddressInToolbar: true,
  })
  const toolbar = view.container.querySelector('[data-address-toolbar-display]')!
  expect(toolbar).toHaveTextContent('English address')
  // JSDOM omits the animation query used when the secondary locale rows swap.
  for (const element of view.container.querySelectorAll('*'))
    element.getAnimations = () => []
  await fireEvent.keyDown(view.getByRole('button', { name: 'Traditional Chinese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  expect(toolbar).toHaveTextContent('繁體地址')
  expect(toolbar).not.toHaveTextContent('English address')
  const details = view.container.querySelector('section[aria-label="Location"]')!
  expect(details).toHaveTextContent('English address')
  expect(details).toHaveTextContent('简体地址')
  expect(details).not.toHaveTextContent('繁體地址')
})

it('shows retained display addresses beneath the viewer heading when no structured fields exist', async () => {
  const initialAddress = emptyFeatureAddress({
    en: '500 Castle Peak Road',
    'zh-hant': '青山道500號',
    'zh-hans': '青山道500号',
  })
  const view = render(FormFixture, { initialAddress, isEditing: false })
  const fallback = (): HTMLElement =>
    view.container.querySelector('[data-address-display-values]')!
  expect(fallback()).toHaveTextContent('500 Castle Peak Road')
  expect(fallback()).not.toHaveTextContent('青山道500號')
  expect(
    view.container.querySelector<HTMLElement>('[data-address-onboarding]'),
  ).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: /^Multilingual$/ }))
  expect(fallback()).toHaveTextContent('繁中')
  expect(fallback()).toHaveTextContent('青山道500號')
  expect(fallback()).toHaveTextContent('简中')
  expect(fallback()).toHaveTextContent('青山道500号')
  expect(fallback().querySelector('p')?.textContent?.trim()).toBe(
    '500 Castle Peak Road',
  )
  expect(view.container.querySelector('[data-address-parts]')).toBeNull()
})

it('shows translated display addresses with structured fields in the viewer', async () => {
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides = {
    en: { buildingName: 'Test Building', formattedAddress: 'English display address' },
    'zh-hant': { buildingName: '測試大廈', formattedAddress: '繁體完整地址' },
    'zh-hans': { buildingName: '测试大厦', formattedAddress: '简体完整地址' },
  }
  const view = render(FormFixture, { initialAddress, isEditing: false })
  expect(view.container.querySelector('[data-address-display-values]')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: /^Multilingual$/ }))
  const displays = view.container.querySelector('[data-address-display-values]')!
  expect(displays).toHaveTextContent('繁體完整地址')
  expect(displays).toHaveTextContent('简体完整地址')
  expect(displays).not.toHaveTextContent('English display address')
  expect(view.container.querySelector('[data-address-parts]')).toHaveTextContent(
    'Test Building',
  )
})

it('places discovery actions inside the empty address area instead of the toolbar', () => {
  const locationActions = createRawSnippet(() => ({
    render: () =>
      '<div data-test-discovery><button>Find Nearby</button><button>Match Location</button></div>',
  }))
  const view = render(FormFixture, {
    initialAddress: emptyFeatureAddress({ en: '500 Castle Peak Road' }),
    locationActions,
    displayAddressInToolbar: true,
  })
  const actions = view.container.querySelectorAll('[data-test-discovery]')
  expect(actions).toHaveLength(1)
  expect(actions[0].closest('[data-address-onboarding]')).not.toBeNull()
})

it('omits the header locale from display-only viewer addresses and marks the alternatives', () => {
  const initialAddress = emptyFeatureAddress({
    en: '500 Castle Peak Road',
    'zh-hant': '青山道500號',
    'zh-hans': '青山道500号',
  })
  const view = render(FormFixture, {
    initialAddress,
    isEditing: false,
    translations: true,
    displayAddressInToolbar: true,
  })
  expect(
    view.container.querySelector('[data-address-toolbar-display]'),
  ).toHaveTextContent('500 Castle Peak Road')
  const displays = view.container.querySelector('[data-address-display-values]')!
  expect(displays).not.toHaveTextContent('500 Castle Peak Road')
  expect(displays).toHaveTextContent('青山道500號')
  expect(displays).toHaveTextContent('青山道500号')
  expect(displays.querySelectorAll('p')).toHaveLength(2)
})

it('offers address matching from the empty viewer even when a display address exists', async () => {
  const onMatchLocation = vi.fn()
  const view = render(FormFixture, {
    initialAddress: emptyFeatureAddress({ en: '500 Castle Peak Road' }),
    isEditing: false,
    displayAddressInToolbar: true,
    onMatchLocation,
  })
  const help = view.container.querySelector<HTMLElement>('[data-address-onboarding]')!
  expect(help).toBeTruthy()
  await fireEvent.click(
    within(help).getByRole('button', { name: 'Match address to location' }),
  )
  expect(onMatchLocation).toHaveBeenCalledOnce()
})

it('shows shared address components once and retains only distinct localized values', () => {
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides = {
    en: {
      buildingNumberExpression: '500',
      buildingName: 'Por Mee Factory Building',
      streetName: 'Castle Peak Road',
      floorExpression: '3/F',
      unitExpression: 'Unit 2',
      premisesName: 'Shared Estate',
    },
    'zh-hant': {
      buildingNumberExpression: '500',
      buildingName: '百美工業大廈',
      streetName: '青山道',
      floorExpression: '3樓',
      unitExpression: '2室',
      premisesName: 'Shared Estate',
    },
    'zh-hans': {
      buildingNumberExpression: '500',
      buildingName: '百美工业大厦',
      streetName: '青山道',
      floorExpression: '3楼',
      unitExpression: '2室',
      premisesName: 'Shared Estate',
    },
  }
  const view = render(FormFixture, {
    initialAddress,
    isEditing: false,
    translations: true,
  })
  const values = (field: string): string[] =>
    [...view.container.querySelectorAll(`[data-address-part="${field}"] dd`)].map(row =>
      row.textContent!.trim(),
    )
  expect(values('buildingNumberExpression')).toEqual(['500'])
  expect(values('floorExpression')).toHaveLength(1)
  expect(values('unitExpression')).toHaveLength(1)
  expect(values('premisesName')).toEqual(['Shared Estate'])
  expect(values('buildingName')).toHaveLength(3)
  expect(values('streetName')).toHaveLength(2)
})

it('shows only reset in the name heading when a source building name changes', async () => {
  const address = emptyFeatureAddress()
  address.source.rawSource = {
    data: { attributes: { i18n: { en: { buildingName: 'Wah Koon Building' } } } },
  }
  const view = render(Fixture, { initialAddress: address })
  const group = view.container.querySelector(
    '[data-address-group="buildingName"]',
  ) as HTMLElement
  expect(group).toBeTruthy()
  expect(within(group).queryByRole('button', { name: 'Use source' })).toBeNull()
  await fireEvent.click(
    within(group).getByRole('button', { name: 'Clear: Building name' }),
  )
  const reset = view
    .getByRole('combobox', { name: 'Building name' })
    .closest('fieldset')!
    .querySelector('legend button') as HTMLButtonElement
  expect(reset).toBeTruthy()
  expect(reset.getAttribute('aria-label')).toBe('Use source')
  await fireEvent.click(reset)
  expect(view.getByRole('button', { name: 'Replace: Wah Koon Building' })).toBeTruthy()
  expect(within(group).queryByRole('button', { name: 'Use source' })).toBeNull()
})

it('accepts a custom name only in the edited language and restores all baseline names', async () => {
  const initialAddress = emptyFeatureAddress()
  initialAddress.source.rawSource = {
    data: {
      attributes: {
        i18n: {
          en: { buildingName: 'Baseline Building', streetName: 'Baseline Road' },
          'zh-hant': { buildingName: '原有大廈' },
        },
      },
    },
  }
  const view = render(FormFixture, { initialAddress, translations: true })
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Baseline Building' }),
  )
  const input = view.getAllByRole('combobox', { name: 'Building name' })[0]
  await fireEvent.input(input, { target: { value: 'Unlisted Building' } })
  await fireEvent.click(
    view.getByRole('button', { name: 'Use “Unlisted Building” as a custom name' }),
  )
  expect(view.getByRole('button', { name: 'Replace: Unlisted Building' })).toBeTruthy()
  expect(view.getByRole('button', { name: 'Replace: 原有大廈' })).toBeTruthy()
  expect(view.getByRole('button', { name: 'Replace: Baseline Road' })).toBeTruthy()
  const group = view.container.querySelector(
    '[data-address-group="buildingName"]',
  ) as HTMLElement
  await fireEvent.click(within(group).getByRole('button', { name: 'Use source' }))
  expect(view.getByRole('button', { name: 'Replace: Baseline Building' })).toBeTruthy()
  expect(within(group).queryByRole('button', { name: 'Use source' })).toBeNull()
})
