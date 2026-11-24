// @vitest-environment jsdom
// SVELTE
import { flushSync } from 'svelte'
// TESTS
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('svelte/transition', () => ({ slide: () => ({ duration: 0 }) }))
import Fixture from './fixtures/components/AddressDivisionsFixture.svelte'
import AddressFormFixture from './fixtures/components/FeatureAddress3dFixture.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// API
import { getAddressDivisionContext } from '#lib/api/division.remote.js'
// TYPES
import type {
  AddressDivision,
  AddressDivisionContext,
} from '#lib/addresses/divisions.js'
vi.mock('#lib/api/division.remote.js', () => ({ getAddressDivisionContext: vi.fn() }))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
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
const member = (id: string, kind: string, category = 'hood'): AddressDivision => ({
  id,
  class: kind,
  category,
  level:
    (
      { macrohood: 4, neighbourhood: 5, microhood: 6, district: 2 } as Record<
        string,
        number
      >
    )[kind] ?? null,
  names: { en: { name: id } },
})
const district = member('Fixed district', 'district', 'administrative')
const island = member('Fixed island', 'major_island', 'landform')
const central = member('Central', 'macrohood')
const child = member('Lan Kwai Fong', 'microhood')
child.hierarchies = {
  locality: [[{ id: central.id, class: central.class, fullContainment: true }]],
}
const context: AddressDivisionContext = {
  available: true,
  memberships: [district, island, central, child],
  options: [central, child],
}
const output = (container: HTMLElement) =>
  JSON.parse(container.querySelector('[data-testid="overrides"]')?.textContent || '{}')

it('puts explanatory text behind an info control beside the title', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve(context) as never,
  )
  const view = render(Fixture)
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'About divisions' })).toBeTruthy(),
  )
  expect(
    view.queryByText(
      'Divisions follow the marker. Neighbourhoods and localities can be adjusted.',
    ),
  ).toBeNull()
  expect(
    view
      .getByRole('button', { name: 'About divisions' })
      .closest('[data-address-divisions]')
      ?.querySelector('h2')?.textContent,
  ).toBe('Divisions')
})

it('selects one neighbourhood, fills its unique source path and keeps the picker stable across draft updates', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve(context) as never,
  )
  const view = render(Fixture)
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Choose neighbourhood' })).toBeTruthy(),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Choose neighbourhood' }))
  await fireEvent.input(view.getByLabelText('Search neighbourhoods'), {
    target: { value: 'Lan Kwai' },
  })
  await fireEvent.click(view.getByRole('button', { name: 'Lan Kwai Fong Microhood' }))
  expect(output(view.container).localityPath).toEqual([central.id, child.id])
  expect(getAddressDivisionContext).toHaveBeenCalledTimes(1)
  expect(view.queryByRole('button', { name: 'Add locality' })).toBeNull()
  expect(view.queryByLabelText('Parent level')).toBeNull()
  expect(view.getByText('Fixed district')).toBeTruthy()
})

it('offers only the existing Prince Edward paths, preserving the standalone boundary branch', async () => {
  const mongKok = member('Mong Kok', 'macrohood')
  const princeEdward = member('Prince Edward', 'neighbourhood')
  const city = { id: 'city', class: 'city', fullContainment: true }
  princeEdward.hierarchies = {
    locality: [
      [city, { id: mongKok.id, class: mongKok.class, fullContainment: false }],
      [city],
    ],
  }
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve({
      ...context,
      options: [mongKok, princeEdward, central, child],
    }) as never,
  )
  const view = render(Fixture)
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Choose neighbourhood' })).toBeTruthy(),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Choose neighbourhood' }))
  await fireEvent.input(view.getByLabelText('Search neighbourhoods'), {
    target: { value: 'Prince Edward' },
  })
  await fireEvent.click(
    view.getByRole('button', { name: 'Prince Edward Neighbourhood' }),
  )
  const choices = view.getByRole('group', {
    name: 'Choose the neighbourhood chain for Prince Edward',
  })
  expect(choices.querySelectorAll('button')).toHaveLength(2)
  expect(view.getByRole('button', { name: 'Mong Kok → Prince Edward' })).toBeTruthy()
  expect(view.queryByLabelText('Search other localities at this level')).toBeNull()
  expect(output(view.container).localityPath).toBeUndefined()
  await fireEvent.click(view.getByRole('button', { name: 'Prince Edward' }))
  expect(output(view.container).localityPath).toEqual([princeEdward.id])
  expect(view.queryByText('Lan Kwai Fong')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Choose neighbourhood' }))
  await fireEvent.input(view.getByLabelText('Search neighbourhoods'), {
    target: { value: 'Prince Edward' },
  })
  await fireEvent.click(
    view.getByRole('button', { name: 'Prince Edward Neighbourhood' }),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Mong Kok → Prince Edward' }))
  expect(output(view.container).localityPath).toEqual([mongKok.id, princeEdward.id])
  expect(view.getAllByRole('list', { name: 'Selected neighbourhood' })).toHaveLength(1)
})

it('removes a specific locality branch and can return to marker membership', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve(context) as never,
  )
  const view = render(Fixture)
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: 'Clear neighbourhood: Central' }),
    ).toBeTruthy(),
  )
  await fireEvent.click(
    view.getByRole('button', { name: 'Clear neighbourhood: Lan Kwai Fong' }),
  )
  expect(output(view.container).localityPath).toEqual([central.id])
  expect(view.queryByText('Lan Kwai Fong')).toBeNull()
  await fireEvent.click(
    view.getByRole('button', { name: 'Clear neighbourhood: Central' }),
  )
  expect(output(view.container).localityPath).toEqual([])
  expect(view.queryByText('Central')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'From marker' }))
  expect(output(view.container).localityPath).toBeNull()
  expect(output(view.container)).toEqual({ localityPath: null })
})

it('does not invent a standalone path when known source ancestors are unavailable', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve({ ...context, options: [child] }) as never,
  )
  const view = render(Fixture)
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Choose neighbourhood' })).toBeTruthy(),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Choose neighbourhood' }))
  await fireEvent.input(view.getByLabelText('Search neighbourhoods'), {
    target: { value: 'Lan Kwai' },
  })
  await fireEvent.click(view.getByRole('button', { name: 'Lan Kwai Fong Microhood' }))
  expect(view.getByRole('alert').textContent).toContain('ancestor paths')
  expect(output(view.container).localityPath).toBeUndefined()
})

it('ignores geography returned late for the previous marker', async () => {
  let first!: (value: AddressDivisionContext) => void
  let second!: (value: AddressDivisionContext) => void
  vi.mocked(getAddressDivisionContext)
    .mockReturnValueOnce(
      new Promise(resolve => {
        first = resolve
      }) as never,
    )
    .mockReturnValueOnce(
      new Promise(resolve => {
        second = resolve
      }) as never,
    )
  const view = render(Fixture)
  await waitFor(() => expect(getAddressDivisionContext).toHaveBeenCalledTimes(1))
  view.getByText('Move marker').click()
  flushSync()
  expect(getAddressDivisionContext).toHaveBeenCalledTimes(2)
  second({ ...context, memberships: [district] })
  first(context)
  await waitFor(() => expect(view.getByText('Fixed district')).toBeTruthy())
  expect(view.queryByText('Lan Kwai Fong')).toBeNull()
})

it('keeps neighbourhood editing controls out of display mode', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve(context) as never,
  )
  const view = render(Fixture, { isEditing: false })
  await waitFor(() => expect(view.getByText('Lan Kwai Fong')).toBeTruthy())
  expect(view.queryByRole('button', { name: 'Choose neighbourhood' })).toBeNull()
  expect(
    view.queryByRole('button', { name: 'Clear neighbourhood: Central' }),
  ).toBeNull()
  expect(view.getByRole('region', { name: 'Island' })).toBeTruthy()
})

it('restores grouped divisions and class labels in the read-only Feature address', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve(context) as never,
  )
  const view = render(AddressFormFixture, { isEditing: false })
  await waitFor(() => expect(view.getByText('Lan Kwai Fong')).toBeTruthy())
  expect(view.container.querySelectorAll('[data-address-divisions]')).toHaveLength(1)
  const locality = view.container.querySelector('[data-division-group="locality"]')
  expect(locality?.textContent).toContain('Microhood')
  expect(
    view.container.querySelector('[data-address-display-values]')?.textContent ?? '',
  ).not.toContain('Lan Kwai Fong')
})

it('retains the same division nodes until the next marker context resolves', async () => {
  let resolveNext!: (value: AddressDivisionContext) => void
  vi.mocked(getAddressDivisionContext)
    .mockReturnValueOnce(Promise.resolve(context) as never)
    .mockReturnValueOnce(
      new Promise(resolve => {
        resolveNext = resolve
      }) as never,
    )
  const view = render(Fixture, { isEditing: false })
  const previousDistrict = await view.findByText('Fixed district')
  const previousIsland = view.getByText('Fixed island')
  const locality = view.getByText('Central')
  await fireEvent.click(view.getByText('Move marker'))
  expect(view.getByText('Fixed district')).toBe(previousDistrict)
  expect(view.getByText('Fixed island')).toBe(previousIsland)
  expect(view.getByText('Central')).toBe(locality)
  expect(locality.closest('[data-division-values-stale]')).toHaveClass('opacity-50')
  expect(
    view.container.querySelector('[data-address-divisions]')?.getAttribute('aria-busy'),
  ).toBe('true')
  resolveNext({ ...context, memberships: [district, central] })
  await waitFor(() => expect(view.queryByText('Fixed island')).toBeNull())
  expect(view.queryByText('Lan Kwai Fong')).toBeNull()
  expect(view.getByText('Fixed district')).toBe(previousDistrict)
  expect(view.getByText('Central')).toBe(locality)
  expect(locality.closest('[data-division-values-stale]')).not.toHaveClass('opacity-50')
})

it('keeps the last resolved geography visible when the new marker lookup fails', async () => {
  vi.mocked(getAddressDivisionContext)
    .mockReturnValueOnce(Promise.resolve(context) as never)
    .mockImplementationOnce(() => Promise.reject(new Error('offline')) as never)
  const view = render(Fixture)
  const districtNode = await view.findByText('Fixed district')
  await fireEvent.click(view.getByText('Move marker'))
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy())
  expect(view.getByText('Fixed district')).toBe(districtNode)
  expect(view.getByText('Lan Kwai Fong')).toBeTruthy()
  expect(
    view
      .getByRole('button', { name: 'Choose neighbourhood' })
      .closest('[aria-disabled="true"]'),
  ).toBeTruthy()
})

it('offers only children of the selected chain and resets an open custom search', async () => {
  const unrelated = member('Unrelated', 'neighbourhood')
  const sibling = member('SoHo', 'microhood')
  sibling.hierarchies = child.hierarchies
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve({
      ...context,
      options: [...context.options, sibling, unrelated],
    }) as never,
  )
  const view = render(Fixture)
  await fireEvent.click(
    await view.findByRole('button', { name: 'Clear neighbourhood: Lan Kwai Fong' }),
  )
  const add = view.getByRole('button', { name: 'Add: Central' })
  const remove = view.getByRole('button', { name: 'Clear neighbourhood: Central' })
  expect(add.closest('li')).not.toBe(remove.closest('li'))
  expect(remove.closest('li')?.nextElementSibling).toBe(add.closest('li'))
  await fireEvent.click(add)
  expect(view.getByRole('button', { name: 'Lan Kwai Fong Microhood' })).toBeTruthy()
  expect(view.getByRole('button', { name: 'SoHo Microhood' })).toBeTruthy()
  expect(view.queryByRole('button', { name: 'Unrelated Neighbourhood' })).toBeNull()
  expect(view.queryByRole('button', { name: 'Add: Lan Kwai Fong' })).toBeNull()
  const input = view.getByLabelText('Search neighbourhoods')
  await fireEvent.keyDown(input, { key: 'Tab' })
  expect(document.activeElement).toBe(
    view.getByRole('button', { name: 'Lan Kwai Fong Microhood' }),
  )
  await fireEvent.click(view.getByRole('button', { name: 'SoHo Microhood' }))
  expect(output(view.container).localityPath).toEqual([central.id, sibling.id])
  await fireEvent.click(view.getByRole('button', { name: 'Clear neighbourhood: SoHo' }))
  await fireEvent.click(view.getByRole('button', { name: 'Add: Central' }))
  await fireEvent.click(view.getByRole('button', { name: 'From marker' }))
  expect(view.queryByLabelText('Search neighbourhoods')).toBeNull()
  expect(output(view.container).localityPath).toBeNull()
})

it('skips Cancel on forward Tab to chain choices and closes the pending choice on reset', async () => {
  const alternate = member('Boundary child', 'neighbourhood')
  alternate.hierarchies = {
    locality: [[{ id: central.id, class: central.class, fullContainment: true }], []],
  }
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve({ ...context, options: [...context.options, alternate] }) as never,
  )
  const view = render(Fixture)
  await fireEvent.click(
    await view.findByRole('button', { name: 'Choose neighbourhood' }),
  )
  const input = view.getByLabelText('Search neighbourhoods')
  await fireEvent.input(input, { target: { value: 'Boundary' } })
  await fireEvent.keyDown(input, { key: 'Tab' })
  expect(document.activeElement).toBe(
    view.getByRole('button', { name: 'Boundary child Neighbourhood' }),
  )
  await fireEvent.click(
    view.getByRole('button', { name: 'Boundary child Neighbourhood' }),
  )
  await fireEvent.keyDown(input, { key: 'Tab' })
  expect(document.activeElement).toBe(
    view.getByRole('button', { name: 'Central → Boundary child' }),
  )
  expect(view.queryByText('Choose one of the existing ancestor paths.')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'From marker' }))
  expect(
    view.queryByRole('group', {
      name: 'Choose the neighbourhood chain for Boundary child',
    }),
  ).toBeNull()
  expect(view.queryByLabelText('Search neighbourhoods')).toBeNull()
})

it('keeps generated display text in sync with locality selection, removal and marker reset', async () => {
  const town = member('Tsuen Wan', 'town')
  town.names['zh-hant'] = { name: '荃灣' }
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve({ available: true, memberships: [town], options: [town] }) as never,
  )
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides.en = {
    streetName: 'Sai Yeung Choi St South',
    buildingNumberExpression: '70',
  }
  const view = render(AddressFormFixture, {
    initialAddress,
    displayAddressInToolbar: true,
  })
  const composed = () =>
    view.container.querySelector(
      '[data-address-toolbar-display] .bits-scrollable-text__content',
    )?.textContent
  await waitFor(() => expect(composed()).toBe('70 Sai Yeung Choi St South, Tsuen Wan'))
  await fireEvent.click(
    view.getByRole('button', { name: 'Clear neighbourhood: Tsuen Wan' }),
  )
  await waitFor(() => expect(composed()).toBe('70 Sai Yeung Choi St South'))
  await fireEvent.click(view.getByRole('button', { name: 'From marker' }))
  await waitFor(() => expect(composed()).toBe('70 Sai Yeung Choi St South, Tsuen Wan'))
  await fireEvent.click(
    view.container.querySelector(
      '[data-address-toolbar-display] button[aria-pressed]',
    )!,
  )
  const display = view.container.querySelector(
    '[data-address-toolbar-display] textarea',
  ) as HTMLTextAreaElement
  await fireEvent.input(display, { target: { value: 'Custom entrance' } })
  await fireEvent.click(
    view.getByRole('button', { name: 'Clear neighbourhood: Tsuen Wan' }),
  )
  expect(display.value).toBe('Custom entrance')
})

it('retains resolved divisions after an unavailable response for the moved marker', async () => {
  vi.mocked(getAddressDivisionContext)
    .mockReturnValueOnce(Promise.resolve(context) as never)
    .mockReturnValueOnce(
      Promise.resolve({ available: false, memberships: [], options: [] }) as never,
    )
  const view = render(Fixture, { isEditing: false })
  const previous = await view.findByText('Fixed district')
  await fireEvent.click(view.getByText('Move marker'))
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy())
  expect(view.getByText('Fixed district')).toBe(previous)
  expect(view.getByText('Lan Kwai Fong')).toBeTruthy()
})

it('latches the parent display address locality until replacement divisions resolve', async () => {
  let resolveNext!: (value: AddressDivisionContext) => void
  vi.mocked(getAddressDivisionContext)
    .mockReturnValueOnce(Promise.resolve(context) as never)
    .mockReturnValueOnce(
      new Promise(resolve => {
        resolveNext = resolve
      }) as never,
    )
  const initialAddress = emptyFeatureAddress()
  initialAddress.overrides.en = {
    streetName: 'Sai Yeung Choi St South',
    buildingNumberExpression: '70',
  }
  const view = render(AddressFormFixture, {
    initialAddress,
    displayAddressInToolbar: true,
  })
  await waitFor(() =>
    expect(
      view.container.querySelector('[data-address-toolbar-display]')?.textContent,
    ).toContain('Lan Kwai Fong'),
  )
  const before = view.container.querySelector(
    '[data-address-toolbar-display]',
  )?.textContent
  await view.rerender({ coordinates: [115, 23] })
  expect(
    view.container.querySelector('[data-address-toolbar-display] [data-address-stale]'),
  ).toHaveClass('opacity-50', 'grayscale')
  expect(
    view.container.querySelector('[data-address-toolbar-display]')?.textContent,
  ).toBe(before)
  resolveNext({ ...context, memberships: [district, central] })
  await waitFor(() =>
    expect(
      view.container.querySelector('[data-address-toolbar-display]')?.textContent,
    ).not.toContain('Lan Kwai Fong'),
  )
  expect(
    view.container.querySelector('[data-address-toolbar-display]')?.textContent,
  ).toContain('Central')
  expect(
    view.container.querySelector('[data-address-toolbar-display] [data-address-stale]'),
  ).not.toHaveClass('opacity-50')
})
