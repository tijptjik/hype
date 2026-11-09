// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { GeocodeRequestError } from '#lib/api/external/geocoding.js'
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// JSDOM does not implement the Web Animations API used by Svelte flip.
Element.prototype.animate = () => ({ cancel() {} }) as Animation
Element.prototype.getAnimations = () => []
Element.prototype.scrollTo = () => {}
vi.mock('svelte/transition', () => ({
  fade: () => ({ duration: 0 }),
  fly: () => ({ duration: 0 }),
  slide: () => ({ duration: 0 }),
}))
const mocks = vi.hoisted(() => ({
  places: vi.fn(),
  addresses: vi.fn(),
  pages: vi.fn(),
  nearby: vi.fn(),
  buildings: vi.fn().mockResolvedValue([]),
  buildingPages: vi.fn(),
}))
vi.mock('#lib/locations/buildingSearch.js', () => ({
  searchBuildingNames: mocks.buildings,
  searchBuildingNamesPage: mocks.buildingPages,
}))
vi.mock('#lib/api/draftLocation.remote.js', () => ({
  searchDraftLocations: mocks.places,
  searchNearbyDraftLocations: mocks.nearby,
}))
vi.mock('#lib/addresses/nameCatalogue.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/addresses/nameCatalogue.js')>()),
  loadAddressNames: vi.fn().mockResolvedValue([]),
}))
// Worker lifecycle is tested separately; component tests retain the real parser.
vi.mock('#lib/addresses/placeAddressWorker.js', async () => {
  const { structurePlaceAddress } = await import('#lib/addresses/nameCatalogue.js')
  return {
    createPlaceAddressWorker: () => ({
      structure: async (
        addresses: import('#lib/addresses/featureAddress.js').FeatureAddress[],
      ) => addresses.map(address => structurePlaceAddress(address, [])),
      destroy: vi.fn(),
    }),
  }
})
// Accepted source previews resolve their details link without a live SvelteKit client.
vi.mock('#lib/api/locationDirectory.remote.js', () => ({
  getSharedLocationIdBySource: () => ({ current: null }),
}))
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionLabel: () => ({ current: null }),
}))
vi.mock('#lib/api/external/geocoding.js', () => ({
  geocodeAddressCandidates: mocks.addresses,
  geocodeAddressPage: mocks.pages,
  GeocodeRequestError: class extends Error {
    constructor(public status: number) {
      super(String(status))
    }
  },
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
/** Choose sync intent without changing the accepted Location.
 * @param enabled Whether source matching is enabled.
 * @returns Completion after selecting the dropdown option.
 */
async function setLocationSync(enabled: boolean): Promise<void> {
  const control = await screen.findByRole('combobox', { name: 'Location sync' })
  await fireEvent.click(control)
  await fireEvent.keyDown(control, { key: enabled ? 'Home' : 'End' })
  await fireEvent.keyDown(control, { key: 'Enter' })
}

/** Accept the explicit picker, or restore an already reviewed association after Unlink. */
async function acceptLocation(): Promise<void> {
  const restore = screen.queryByRole('combobox', { name: 'Location sync' })
  if (restore?.textContent?.includes('Unsynced')) {
    await setLocationSync(true)
    return
  }
  await fireEvent.click(screen.getByRole('button', { name: 'Locate feature here' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /^Use(?: Location)?$/ }),
  )
}

it('focuses after navigation, searches while typing and returns the explicitly selected editable draft', async () => {
  vi.useRealTimers()
  const facts = {
    classification: {
      basicCategory: 'bakery',
      taxonomy: {
        primary: 'bakery',
        hierarchy: ['food_and_drink', 'bakery'],
        alternates: ['cafe'],
      },
    },
    names: { en: 'Test Bakery' },
    location: {
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      address: {
        status: 'unresolved',
        address2dId: null,
        address3dId: null,
        address3dUnitId: null,
        snapshotId: null,
        rawSource: {},
        fallbackDisplay: { en: '1 Test Road' },
      },
    },
  }
  mocks.places.mockResolvedValue({ rows: [{ id: 'bakery', facts }], partial: false })
  mocks.addresses.mockResolvedValue([])
  const onSelect = vi.fn()
  const view = render(DraftSearch, { active: false, focusRequest: 0, onSelect })
  await view.rerender({ active: true, focusRequest: 1, onSelect })
  const input = screen.getByRole('textbox')
  await waitFor(() => expect(document.activeElement).toBe(input))
  await fireEvent.input(input, { target: { value: 'Bakery' } })
  await waitFor(() =>
    expect(mocks.places).toHaveBeenCalledWith(expect.objectContaining({ q: 'Bakery' })),
  )
  expect(mocks.addresses).toHaveBeenCalledWith(
    { address: 'Bakery' },
    { signal: expect.any(AbortSignal) },
  )
  expect(await screen.findByText('Food and drink › Bakery · Cafe')).toBeTruthy()
  await fireEvent.keyDown(await screen.findByRole('button', { name: /Test Bakery/ }), {
    key: 'Enter',
  })
  expect(onSelect).not.toHaveBeenCalled()
  await acceptLocation()
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        names: { en: 'Test Bakery' },
        address: expect.objectContaining({ coordinates: [114.1, 22.3] }),
      }),
    ),
  )
})

it('publishes numbered map previews and highlights hovered rows without selecting them', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    Array.from({ length: 7 }, (_, index) => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: `address-${index}`,
            fallbackDisplay: { en: `Road ${index}` },
          },
          coordinates: [114 + index / 100, 22.3],
          matchStatus: 'unresolved',
          overrides: {},
        },
      },
    })),
  )
  const onSelect = vi.fn()
  const onMapCandidates = vi.fn()
  render(DraftSearch, { active: true, focusRequest: 0, onSelect, onMapCandidates })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Road' } })
  const row = await screen.findByRole('button', { name: /1 Road 0/ })
  expect(document.querySelectorAll('[data-result-number]')).toHaveLength(7)
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(7))
  await fireEvent.mouseEnter(row)
  await waitFor(() =>
    expect(onMapCandidates.mock.lastCall?.[0][0]).toMatchObject({
      number: 1,
      highlighted: true,
    }),
  )
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.mouseLeave(row)
  await waitFor(() =>
    expect(onMapCandidates.mock.lastCall?.[0][0].highlighted).toBe(false),
  )
  const addresses = screen.getByRole('button', { name: 'Address' })
  await fireEvent.click(addresses)
  expect(document.querySelectorAll('[data-result-number]')).toHaveLength(0)
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(0))
  await fireEvent.click(addresses)
  expect(document.querySelectorAll('[data-result-number]')).toHaveLength(7)
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(7))
  await new Promise(resolve => setTimeout(resolve, 350))
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
  expect(mocks.places).toHaveBeenCalledTimes(1)
})

it('shows provider failures without a retry footer and permits searching again', async () => {
  vi.useRealTimers()
  mocks.places.mockRejectedValue(new Error('unavailable'))
  mocks.addresses.mockRejectedValue(new Error('timeout'))
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Kirby' } })
  await screen.findByText(/Places search is unavailable/)
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  expect(screen.queryByText(/no matching/i)).toBeNull()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull(),
  )
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(2))
})

it('only drops a pin when map mode is explicitly requested', async () => {
  vi.useRealTimers()
  const onDropPin = vi.fn()
  const onSelect = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onDropPin,
  })
  expect(onDropPin).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Map pin' }))
  expect(onDropPin).toHaveBeenCalledTimes(1)
  await view.rerender({
    active: true,
    focusRequest: 0,
    onSelect,
    onDropPin,
    hasPin: true,
  })
  expect(screen.queryByRole('button', { name: /drop pin/i })).toBeNull()
})

it('renders loading skeletons without visible loading text while search is pending', async () => {
  vi.useRealTimers()
  mocks.places.mockReturnValue(new Promise(() => {}))
  mocks.addresses.mockReturnValue(new Promise(() => {}))
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Lego' } })
  const status = screen.getByRole('status', { name: 'Loading resources' })
  expect(status.textContent?.trim()).toBe('')
  expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3)
  expect(screen.queryByText('Loading resources')).toBeNull()
  expect(screen.queryByText('0 results shown')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Retry search' })).toBeNull()
})

it('shows address results while places are pending and cancels obsolete lookups', async () => {
  vi.useRealTimers()
  mocks.places.mockReturnValue(new Promise(() => {}))
  mocks.addresses.mockResolvedValue([
    {
      addressMeta: {
        address: {
          version: 1,
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: 'first',
            fallbackDisplay: { en: 'Fast Road' },
          },
          coordinates: [114.1, 22.3],
          matchStatus: 'unresolved',
          overrides: {},
        },
      },
    },
  ])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  const input = screen.getByRole('textbox')
  await fireEvent.input(input, { target: { value: 'Fast' } })
  await screen.findByRole('button', { name: /Fast Road/ })
  const signal = mocks.addresses.mock.lastCall?.[1].signal
  expect(signal.aborted).toBe(false)
  await fireEvent.input(input, { target: { value: 'Next' } })
  expect(signal.aborted).toBe(true)
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /Fast Road/ })).toBeNull(),
  )
})
it('shows places while addresses are pending and ignores late results after selection', async () => {
  vi.useRealTimers()
  let resolveAddresses!: (value: unknown[]) => void
  mocks.addresses.mockReturnValue(
    new Promise(resolve => {
      resolveAddresses = resolve
    }),
  )
  mocks.places.mockResolvedValue({
    partial: false,
    rows: [
      {
        id: 'fast',
        facts: {
          names: { en: 'Fast Place' },
          location: {
            geometry: { type: 'Point', coordinates: [114.1, 22.3] },
            address: { status: 'unresolved', rawSource: {}, fallbackDisplay: {} },
          },
        },
      },
    ],
  })
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Fast' } })
  await fireEvent.keyDown(await screen.findByRole('button', { name: /Fast Place/ }), {
    key: 'Enter',
  })
  resolveAddresses([])
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(screen.queryByText(/no matching/i)).toBeNull()
  expect(screen.queryByRole('button', { name: /Fast Place/ })).not.toBeNull()
})

it('filters cached rows while typing and replaces each provider without clearing pending kinds', async () => {
  vi.useRealTimers()
  const address = (id: string, street = 'Hollywood Road') => ({
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.28] as [number, number],
    source: { ...emptyFeatureAddress().source, address2dId: id },
    overrides: { en: { streetName: street, buildingNumberExpression: '123' } },
  })
  mocks.places.mockResolvedValueOnce({
    partial: false,
    rows: [
      {
        id: 'shop',
        facts: {
          names: { en: 'Hollywood Shop' },
          location: {
            geometry: { type: 'Point', coordinates: [114.15, 22.28] },
            address: {
              status: 'unresolved',
              rawSource: {},
              fallbackDisplay: { en: 'Hollywood Road' },
            },
          },
        },
      },
    ],
  })
  mocks.buildings.mockResolvedValueOnce([
    {
      id: 'building:tower',
      kind: 'building',
      names: { en: 'Hollywood Tower' },
      address: address('tower'),
    },
  ])
  mocks.addresses.mockResolvedValueOnce(
    ['retained', 'rejected'].map(id => ({
      addressMeta: {
        address: address(id, id === 'retained' ? 'Hollywood Road' : 'Holland Street'),
      },
    })),
  )
  let resolvePlaces!: (value: { rows: []; partial: boolean }) => void
  let resolveBuildings!: (value: []) => void
  let resolveAddresses!: (value: unknown[]) => void
  mocks.places.mockImplementation(
    () =>
      new Promise(resolve => {
        resolvePlaces = resolve
      }),
  )
  mocks.buildings.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveBuildings = resolve
      }),
  )
  mocks.addresses.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveAddresses = resolve
      }),
  )
  const onMapCandidates = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  const input = screen.getByRole('textbox')
  await fireEvent.input(input, { target: { value: 'Hol' } })
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(4),
  )
  const retained = document.querySelector(
    '[data-result-id="address:retained:114.15,22.28"]',
  )
  const oldSignal = mocks.addresses.mock.calls[0][1].signal
  await fireEvent.input(input, { target: { value: 'Hollywood' } })
  expect(oldSignal.aborted).toBe(true)
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(3),
  )
  expect(
    document.querySelector('[data-result-id="address:retained:114.15,22.28"]'),
  ).toBe(retained)
  await fireEvent.input(input, { target: { value: 'ＨＯＬＬＹＷＯＯＤ rd.' } })
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(3)
  await waitFor(() => expect(mocks.addresses).toHaveBeenCalledTimes(2))
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(3)
  expect(screen.queryByRole('status', { name: 'Loading resources' })).toBeNull()
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(3))
  // Empty fresh responses remove their own stale rows, leaving the slow provider visible.
  resolvePlaces({ rows: [], partial: false })
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(2),
  )
  resolveBuildings([])
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(1),
  )
  expect(
    document.querySelector('[data-result-id="address:retained:114.15,22.28"]'),
  ).toBe(retained)
  resolveAddresses([{ addressMeta: { address: address('fresh') } }])
  await waitFor(() =>
    expect(
      document.querySelector('[data-result-id="address:fresh:114.15,22.28"]'),
    ).not.toBeNull(),
  )
  expect(
    document.querySelector('[data-result-id="address:retained:114.15,22.28"]'),
  ).toBeNull()
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(1)
  await fireEvent.input(input, { target: { value: '' } })
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(0)
})

it('retains multilingual matches through backspacing and ignores superseded responses', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.28] as [number, number],
    overrides: {
      en: { streetName: 'Hollywood Road' },
      'zh-hant': { streetName: '荷李活道' },
    },
  }
  mocks.addresses.mockResolvedValueOnce([{ addressMeta: { address } }])
  let resolveObsolete!: (value: unknown[]) => void
  mocks.addresses.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveObsolete = resolve
      }),
  )
  mocks.addresses.mockRejectedValueOnce(new Error('unavailable'))
  const onMapCandidates = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  const input = screen.getByRole('textbox')
  await fireEvent.input(input, { target: { value: '荷李' } })
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(1),
  )
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(1))
  onMapCandidates.mockClear()
  const row = document.querySelector('[data-result-id]')
  await fireEvent.input(input, { target: { value: '荷李活' } })
  await waitFor(() => expect(mocks.addresses).toHaveBeenCalledTimes(2))
  await fireEvent.input(input, { target: { value: '荷' } })
  resolveObsolete([])
  await waitFor(() => expect(mocks.addresses).toHaveBeenCalledTimes(3))
  await screen.findByText(/Address search is unavailable/)
  expect(document.querySelector('[data-result-id]')).toBe(row)
  expect(onMapCandidates.mock.calls.every(([markers]) => markers.length === 1)).toBe(
    true,
  )
})

it('keeps unchanged cached matches from republishing markers and cancels filtering on clear', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValueOnce([
    {
      addressMeta: {
        address: {
          ...emptyFeatureAddress(),
          coordinates: [114.15, 22.28],
          overrides: { en: { streetName: 'Hollywood Road' } },
        },
      },
    },
  ])
  mocks.addresses.mockReturnValue(new Promise(() => {}))
  const onMapCandidates = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  const input = screen.getByRole('textbox') as HTMLInputElement
  await fireEvent.input(input, { target: { value: 'Holly' } })
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(1))
  const retained = document.querySelector('[data-result-id]')
  onMapCandidates.mockClear()
  await fireEvent.input(input, { target: { value: 'Hollywood' } })
  await waitFor(() => expect(mocks.addresses).toHaveBeenCalledTimes(2))
  expect(document.querySelector('[data-result-id]')).toBe(retained)
  expect(onMapCandidates).not.toHaveBeenCalled()
  // Clear in the same task that queued filtering; its later continuation must not restore rows.
  input.value = 'Hollywood rd'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await fireEvent.keyDown(input, { key: 'Escape' })
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(input.value).toBe('')
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(0)
  expect(onMapCandidates.mock.lastCall?.[0]).toEqual([])
})

it('keeps singleton results and map numbers visible without a back button or refetch', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([
    {
      addressMeta: {
        address: {
          version: 1,
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: 'hollywood',
            fallbackDisplay: { en: 'Hollywood Terrace, 123 Hollywood Rd' },
          },
          coordinates: [114.15, 22.28],
          matchStatus: 'unresolved',
          overrides: {},
        },
      },
    },
  ])
  const onBack = vi.fn()
  const onMapCandidates = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onBack,
    onMapCandidates,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'hollywood' } })
  const row = await screen.findByRole('button', { name: /Hollywood Terrace/ })
  expect(row.dataset.resultNumber).toBe('1')
  expect(row.dataset.resultKind).toBe('address')
  expect(
    screen.getByText('Hollywood Terrace, 123 Hollywood Rd', {
      selector: ':not([aria-hidden="true"])',
    }),
  ).toBeTruthy()
  await waitFor(() =>
    expect(onMapCandidates.mock.lastCall?.[0][0]).toMatchObject({
      number: 1,
      id: 'address:hollywood:114.15,22.28',
    }),
  )
  await fireEvent.keyDown(row, { key: 'Enter' })
  expect(screen.queryByRole('button', { name: /back to results/i })).toBeNull()
  expect(onBack).not.toHaveBeenCalled()
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('hollywood')
  expect(
    (await screen.findByRole('button', { name: /Hollywood Terrace/ })).dataset
      .resultNumber,
  ).toBe('1')
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(1))
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
})

it('only requests enabled search types including Buildings', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  const shops = screen.getByRole('button', { name: 'Shops' })
  const addresses = screen.getByRole('button', { name: 'Address' })
  expect(
    (screen.getByRole('button', { name: 'Building' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  await fireEvent.click(screen.getByRole('button', { name: 'Building' }))
  expect(shops.getAttribute('aria-pressed')).toBe('true')
  expect(addresses.getAttribute('aria-pressed')).toBe('true')
  await fireEvent.click(shops)
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'lego' } })
  await waitFor(() => expect(mocks.addresses).toHaveBeenCalledTimes(1))
  expect(mocks.places).not.toHaveBeenCalled()
  const signal = mocks.addresses.mock.lastCall?.[1].signal
  await fireEvent.click(addresses)
  expect(signal.aborted).toBe(true)
  expect(screen.queryByText('Select a search type.')).toBeNull()
  expect(screen.getByRole('textbox')).toBeTruthy()
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('lego')
  expect(
    await screen.findByText('Select a search type.', {}, { timeout: 3000 }),
  ).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  await fireEvent.click(shops)
  expect(screen.queryByText('Select a search type.')).toBeNull()
  expect(screen.getByRole('textbox')).toBeTruthy()
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(1))
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
})

it('runs the search icon action immediately without repeating the debounced request', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'lego' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(mocks.places).toHaveBeenCalledTimes(1)
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
  await new Promise(resolve => setTimeout(resolve, 350))
  expect(mocks.places).toHaveBeenCalledTimes(1)
})

it('retains all markers and singleton results during preview without a back button', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    [0, 1].map(index => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: String(index),
            fallbackDisplay: { en: 'Road ' + index },
          },
          coordinates: [114.15 + index / 1000, 22.28],
          matchStatus: 'unresolved',
          overrides: {},
        },
      },
    })),
  )
  const onMapCandidates = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  const input = screen.getByRole('textbox')
  await fireEvent.input(input, { target: { value: 'Road' } })
  const row = await screen.findByRole('button', { name: /1 Road 0/ })
  await fireEvent.keyDown(input, { key: 'Tab' })
  expect(document.activeElement).toBe(row)
  await fireEvent.keyDown(row, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(input)
  await fireEvent.keyDown(row, { key: 'Enter' })
  await waitFor(() => {
    const markers = onMapCandidates.mock.lastCall?.[0]
    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({ selected: true, hidden: false })
    expect(markers[1]).toMatchObject({ selected: false, hidden: false })
  })
  expect(screen.queryByRole('button', { name: /back to results/i })).toBeNull()
  await waitFor(() =>
    expect(
      onMapCandidates.mock.lastCall?.[0].every(
        (marker: { hidden: boolean }) => !marker.hidden,
      ),
    ).toBe(true),
  )
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
})

it('searches nearby enabled providers around the pin using the bounded radius', async () => {
  vi.useRealTimers()
  mocks.nearby.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onDropPin: vi.fn(),
    hasPin: true,
    coordinates: [114.15, 22.28],
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Shops' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Map pin' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Search Nearby' }))
  await waitFor(() =>
    expect(mocks.addresses).toHaveBeenCalledWith(
      { lng: 114.15, lat: 22.28 },
      expect.objectContaining({
        maxDistance: 300,
        limit: 50,
        candidateCoordinates: true,
      }),
    ),
  )
  expect(mocks.nearby).not.toHaveBeenCalled()
})

it('applies filters only on acceptance, badges active filters, and clears results without dropping filters', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Japanese' } })
  await screen.findByRole('button', { name: 'Clear search' })
  await fireEvent.click(screen.getByRole('button', { name: 'Place filters' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Category' }), {
    target: { value: 'japanese restaurant' },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Japanese Restaurant' }))
  const count = mocks.places.mock.calls.length
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(mocks.places).toHaveBeenCalledTimes(count)
  await fireEvent.click(screen.getByRole('button', { name: 'Place filters' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Category' }), {
    target: { value: 'japanese restaurant' },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Japanese Restaurant' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  await waitFor(() =>
    expect(mocks.places).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: { taxonomyCategory: 'japanese_restaurant', operatingStatus: 'open' },
      }),
    ),
  )
  expect(screen.getByRole('button', { name: 'Place filters' }).textContent).toContain(
    '1',
  )
  await fireEvent.click(await screen.findByRole('button', { name: 'Clear search' }))
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText('0 results shown')).toBeNull()
  expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Place filters' }).textContent).toContain(
    '1',
  )
})

it('searches an applied category without text, skips text providers and reruns on Enter', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  await fireEvent.click(screen.getByRole('button', { name: 'Place filters' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Category' }), {
    target: { value: 'japanese restaurant' },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Japanese Restaurant' }))
  expect(mocks.places).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  await waitFor(() =>
    expect(mocks.places).toHaveBeenCalledWith(
      expect.objectContaining({
        q: '',
        filters: { taxonomyCategory: 'japanese_restaurant', operatingStatus: 'open' },
      }),
    ),
  )
  expect(mocks.buildings).not.toHaveBeenCalled()
  expect(mocks.pages).not.toHaveBeenCalled()
  await fireEvent.click(await screen.findByRole('button', { name: 'Clear search' }))
  await new Promise(resolve => setTimeout(resolve, 350))
  expect(mocks.places).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(2))
  await fireEvent.click(screen.getByRole('button', { name: 'Place filters' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  await new Promise(resolve => setTimeout(resolve, 350))
  expect(mocks.places).toHaveBeenCalledTimes(2)
})

it('keeps status-only whitespace searches disabled and requires Places for category-only search', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  const view = render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  view.component.restoreProgress({
    ...view.component.getProgress(),
    query: '   ',
    filters: { operatingStatus: 'any' },
  })
  await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  expect(mocks.places).not.toHaveBeenCalled()
  view.component.restoreProgress({
    ...view.component.getProgress(),
    filters: { taxonomyPrimary: 'bakery' },
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: ' ' } })
  await waitFor(() =>
    expect(mocks.places).toHaveBeenCalledWith(expect.objectContaining({ q: '' })),
  )
  await fireEvent.click(await screen.findByRole('button', { name: 'Clear search' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Shops' }))
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  expect(mocks.buildings).not.toHaveBeenCalled()
  expect(mocks.pages).not.toHaveBeenCalled()
})

it.each(['focus', 'hover', 'none', 'blur', 'clear'] as const)(
  'keeps the highlighted result centred after streamed reordering (%s)',
  async highlight => {
    vi.useRealTimers()
    let resolvePlaces!: (value: unknown) => void
    mocks.places.mockReturnValue(
      new Promise(resolve => {
        resolvePlaces = resolve
      }),
    )
    mocks.addresses.mockResolvedValue([
      {
        addressMeta: {
          address: {
            version: 1,
            source: {
              rawSource: {},
              status: 'unresolved',
              address2dId: 'fast',
              fallbackDisplay: { en: 'Fast Road' },
            },
            coordinates: [114.1, 22.3],
            matchStatus: 'unresolved',
            overrides: {},
          },
        },
      },
    ])
    const onMapCandidates = vi.fn()
    const { container } = render(DraftSearch, {
      active: true,
      focusRequest: 0,
      onSelect: vi.fn(),
      onMapCandidates,
    })
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Fast' } })
    const address = await screen.findByRole('button', { name: /Fast Road/ })
    expect(address.dataset.resultNumber).toBe('1')
    const row = address.closest<HTMLElement>('[data-search-result]')!
    const results = row.parentElement!
    const scroll = vi.spyOn(results, 'scrollTo')
    Object.defineProperty(results, 'clientHeight', { value: 400 })
    vi.spyOn(results, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect)
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: 600,
      height: 80,
    } as DOMRect)
    let finishAnimation!: () => void
    vi.spyOn(row, 'getAnimations').mockReturnValue([
      {
        finished: new Promise<void>(resolve => {
          finishAnimation = resolve
        }),
      } as unknown as Animation,
    ])
    if (highlight === 'hover') await fireEvent.mouseEnter(address)
    else if (highlight !== 'none') {
      address.focus()
      await fireEvent.focusIn(address)
    }
    scroll.mockClear()
    resolvePlaces({
      partial: false,
      rows: [
        {
          id: 'shop',
          facts: {
            names: { en: 'Late Shop' },
            location: {
              geometry: { type: 'Point', coordinates: [114.2, 22.3] },
              address: { status: 'unresolved', rawSource: {}, fallbackDisplay: {} },
            },
          },
        },
      ],
    })
    await screen.findByRole('button', { name: /Late Shop/ })
    await waitFor(() => {
      expect(
        [...container.querySelectorAll<HTMLElement>('[data-result-kind]')].map(row => [
          row.dataset.resultKind,
          row.dataset.resultNumber,
        ]),
      ).toEqual([
        ['establishment', '1'],
        ['address', '2'],
      ])
      expect(
        onMapCandidates.mock.lastCall?.[0].map(
          (marker: { kind: string; number: number }) => [marker.kind, marker.number],
        ),
      ).toEqual([
        ['establishment', 1],
        ['address', 2],
      ])
    })
    expect(address.dataset.resultNumber).toBe('2')
    expect(scroll).not.toHaveBeenCalled()
    if (highlight === 'blur') {
      screen.getByRole('textbox').focus()
      await fireEvent.focusOut(address)
    } else if (highlight === 'clear') {
      await fireEvent.input(screen.getByRole('textbox'), { target: { value: '' } })
    }
    finishAnimation()
    if (highlight === 'focus' || highlight === 'hover') {
      await waitFor(() =>
        expect(scroll).toHaveBeenLastCalledWith({ top: 340, behavior: 'instant' }),
      )
      expect(row.dataset.highlighted).toBe('true')
      if (highlight === 'focus') expect(document.activeElement).toBe(address)
    } else {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(scroll).not.toHaveBeenCalled()
    }
  },
)

it('expands a premises group in numeric order, requires an explicit action after repeated Enter presses', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    ['219', '209-223', '211'].map(number => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            status: 'unresolved',
            rawSource: {},
            fallbackDisplay: {},
            address2dId: number,
          },
          matchStatus: 'unresolved',
          coordinates: [114.15, 22.3],
          overrides: {
            en: {
              premisesName: 'Curios Court',
              streetName: 'Hollywood Road',
              buildingNumberExpression: number,
            },
          },
        },
      },
    })),
  )
  const onSelect = vi.fn(),
    onPreview = vi.fn(),
    onMapCandidates = vi.fn(),
    onSelectionStart = vi.fn(),
    onReturnToResults = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onPreview,
    onMapCandidates,
    onSelectionStart,
    onReturnToResults,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Curios' } })
  await fireEvent.click(await screen.findByRole('button', { name: /3 addresses/ }))
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-result-id]')]
  expect(buttons.map(button => button.dataset.resultId?.split(':')[1])).toEqual([
    '209-223',
    '211',
    '219',
  ])
  expect(onPreview).not.toHaveBeenCalled()
  await fireEvent.focus(buttons[0])
  await fireEvent.mouseEnter(buttons[1])
  const markers = onMapCandidates.mock.lastCall?.[0]
  expect(markers).toHaveLength(3)
  expect(
    markers.every((marker: { fitGroup?: string }) => Boolean(marker.fitGroup)),
  ).toBe(true)
  expect(
    markers.find((marker: { id: string }) => marker.id === buttons[1].dataset.resultId)
      ?.highlighted,
  ).toBe(true)
  expect(
    markers.find((marker: { id: string }) => marker.id === buttons[0].dataset.resultId)
      ?.highlighted,
  ).toBe(false)
  await fireEvent.keyDown(buttons[0], { key: 'Enter' })
  expect(onPreview).toHaveBeenCalledTimes(1)
  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Just use address' })).toBeTruthy()
  await fireEvent.keyDown(buttons[0], { key: 'Enter' })
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Just use address' }))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(onSelectionStart).toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
  await waitFor(() => expect(onReturnToResults).toHaveBeenCalledOnce())
})

it('unlinking an accepted place cancels the association without undoing copied fields', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({
    rows: [
      {
        id: 'place',
        resourceReleaseId: 'release',
        facts: {
          names: { en: 'Bakery' },
          location: {
            geometry: { type: 'Point', coordinates: [114.15, 22.3] },
            address: {
              status: 'unresolved',
              rawSource: {},
              fallbackDisplay: { en: '1 Road' },
            },
          },
        },
      },
    ],
    partial: false,
  })
  mocks.addresses.mockResolvedValue([])
  const onSelect = vi.fn(),
    onUnlink = vi.fn(),
    onBack = vi.fn(),
    onAcceptedChange = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onUnlink,
    onBack,
    onAcceptedChange,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Bakery' } })
  await fireEvent.keyDown(await screen.findByRole('button', { name: /Bakery/ }), {
    key: 'Enter',
  })
  await acceptLocation()
  await setLocationSync(false)
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(onUnlink).toHaveBeenCalledTimes(1)
  expect(onBack).not.toHaveBeenCalled()
  expect(screen.getByText('Bakery', { exact: true })).toBeTruthy()
  expect(screen.getByRole('combobox', { name: 'Location sync' }).textContent).toContain(
    'Unsynced',
  )
  expect(screen.queryByRole('button', { name: 'Add Manual Entry' })).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(onAcceptedChange).toHaveBeenLastCalledWith(true)
  expect(onSelect.mock.calls[0][0].address.source.fallbackDisplay.en).toBe('1 Road')
  expect(screen.getByRole('button', { name: 'Back to proposed location' })).toBeTruthy()
  await acceptLocation()
  await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
  expect(onSelect.mock.lastCall?.[0]).toMatchObject({
    nameMode: 'independent',
    source: { ssId: 'place', resourceReleaseId: 'release' },
  })
  expect(screen.getByRole('combobox', { name: 'Location sync' }).textContent).toContain(
    'Synced',
  )
})

it.each([
  {
    partial: false,
    limited: true,
    message: /Showing a limited set of establishments/,
    retry: false,
  },
  {
    partial: true,
    limited: false,
    message: /Some sources could not be searched/,
    retry: false,
  },
])(
  'distinguishes nearby coverage $partial/$limited from an outage',
  async ({ partial, limited, message, retry }) => {
    vi.useRealTimers()
    mocks.nearby.mockResolvedValue({
      rows: [
        {
          id: 'bakery',
          facts: {
            names: { en: 'Available Bakery' },
            location: {
              geometry: { type: 'Point', coordinates: [114.15, 22.28] },
              address: { status: 'unresolved', rawSource: {}, fallbackDisplay: {} },
            },
          },
        },
      ],
      partial,
      limited,
    })
    mocks.addresses.mockResolvedValue([])
    render(DraftSearch, {
      active: true,
      focusRequest: 0,
      onSelect: vi.fn(),
      onDropPin: vi.fn(),
      hasPin: true,
      coordinates: [114.15, 22.28],
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Map pin' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Search Nearby' }))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Available Bakery/ })).toBeTruthy()
    expect(screen.queryByText(/Places search is unavailable/)).toBeNull()
    expect(Boolean(screen.queryByRole('button', { name: /retry/i }))).toBe(retry)
  },
)

it('Shift+Tab from the first subset row focuses its Back to results button', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    ['1', '3'].map(number => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            status: 'unresolved',
            rawSource: {},
            fallbackDisplay: {},
            address2dId: number,
          },
          matchStatus: 'unresolved',
          coordinates: [114.15, 22.3],
          overrides: {
            en: {
              premisesName: 'Tai Hing House',
              streetName: 'Square Street',
              buildingNumberExpression: number,
            },
          },
        },
      },
    })),
  )
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Tai Hing' } })
  const collapsed = await screen.findByRole('button', { name: /2 addresses/ })
  expect(collapsed.textContent).toContain('1-3 Square Street')
  await fireEvent.click(collapsed)
  expect(screen.getByText('1 Square Street')).toBeTruthy()
  expect(screen.getByText('3 Square Street')).toBeTruthy()
  const first = document.querySelector<HTMLButtonElement>('[data-result-id]')!
  first.focus()
  await fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Back to results' }),
  )
  await fireEvent.click(first)
  await fireEvent.click(screen.getByRole('button', { name: 'Just use address' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
  expect(await screen.findByRole('button', { name: /2 addresses/ })).toBeTruthy()
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(1)
})

it('Link location preserves the explicit Feature naming intent', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({
    rows: [
      {
        id: 'place',
        resourceReleaseId: 'release',
        facts: {
          names: { en: 'Place name' },
          location: {
            geometry: { type: 'Point', coordinates: [114.15, 22.3] },
            address: { status: 'unresolved', rawSource: {}, fallbackDisplay: {} },
          },
        },
      },
    ],
    partial: false,
  })
  mocks.addresses.mockResolvedValue([])
  const onSelect = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    currentNameMode: 'independent',
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Place' } })
  expect(screen.queryByRole('combobox', { name: 'Location sync' })).toBeNull()
  await fireEvent.keyDown(await screen.findByRole('button', { name: /Place name/ }), {
    key: 'Enter',
  })
  await acceptLocation()
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      nameMode: 'independent',
      source: { ssId: 'place', resourceReleaseId: 'release' },
    }),
  )
})

it('hands forward Tab from the last result to manual entry without intercepting Shift+Tab', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({
    rows: [1, 2].map(number => ({
      id: `tab-${number}`,
      facts: {
        names: { en: `Tab shop ${number}` },
        location: {
          geometry: { type: 'Point', coordinates: [114.15, 22.28] },
          address: { status: 'unresolved', rawSource: {}, fallbackDisplay: {} },
        },
      },
    })),
    partial: false,
  })
  mocks.addresses.mockResolvedValue([])
  const onResultsEnd = vi.fn(() => true)
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onResultsEnd,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Tab shop' } })
  const first = await screen.findByRole('button', { name: /Tab shop 1/ })
  const last = await screen.findByRole('button', { name: /Tab shop 2/ })
  await fireEvent.keyDown(first, { key: 'Tab' })
  await fireEvent.keyDown(last, { key: 'Tab', shiftKey: true })
  expect(onResultsEnd).not.toHaveBeenCalled()
  expect(await fireEvent.keyDown(last, { key: 'Tab' })).toBe(false)
  expect(onResultsEnd).toHaveBeenCalledTimes(1)
  await fireEvent.keyDown(last, { key: 'Enter' })
  const actions = document.querySelectorAll<HTMLButtonElement>(
    '[data-result-actions="place:tab-2"] button',
  )
  expect(actions.length).toBe(2)
  await fireEvent.keyDown(last, { key: 'Tab' })
  expect(onResultsEnd).toHaveBeenCalledTimes(1)
  await fireEvent.keyDown(actions[1], { key: 'Tab' })
  expect(onResultsEnd).toHaveBeenCalledTimes(2)
})

it('guides name, map and manual entry with distinct controls', async () => {
  vi.useRealTimers()
  const animation = vi.spyOn(Element.prototype, 'animate')
  const onDropPin = vi.fn()
  const onManualEntry = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onDropPin,
    onManualEntry,
    hasPin: true,
    coordinates: [114.15, 22.28],
  })
  expect(screen.queryByRole('button', { name: 'Drop Pin' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Search by location' }))
  expect(onDropPin).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByRole('button', { name: 'Search Nearby' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Shops' })).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Search by name' }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
  expect(animation.mock.contexts).toContain(screen.getByRole('textbox').parentElement)
  expect(animation.mock.contexts).not.toContain(screen.getByRole('textbox'))
  animation.mockRestore()
  await fireEvent.click(screen.getByRole('button', { name: 'Add Manual Entry' }))
  expect(onManualEntry).toHaveBeenCalledTimes(1)
})

it.each([['Link location', undefined]] as const)(
  'accepts a building with %s',
  async (action, nameMode) => {
    vi.useRealTimers()
    mocks.places.mockResolvedValue({ rows: [], partial: false })
    mocks.addresses.mockResolvedValue([])
    mocks.buildings.mockResolvedValueOnce([
      {
        id: 'building:b',
        kind: 'building',
        buildingSource: { id: 'b', release: 'r1' },
        names: { en: 'Example Tower' },
        address: {
          version: 1,
          coordinates: [114.1, 22.3],
          matchStatus: 'unresolved',
          overrides: {
            en: {
              buildingName: 'Example Tower',
              streetName: 'Test Road',
              buildingNumberFrom: '12',
            },
          },
          source: {
            status: 'unresolved',
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            snapshotId: null,
            rawSource: {},
            fallbackDisplay: {},
          },
        },
      },
    ])
    const onSelect = vi.fn(),
      onUnlink = vi.fn()
    render(DraftSearch, { active: true, focusRequest: 0, onSelect, onUnlink })
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Example' } })
    await waitFor(() =>
      expect(mocks.buildings).toHaveBeenCalledWith(
        'Example',
        'en',
        expect.any(Function),
      ),
    )
    await fireEvent.keyDown(
      await screen.findByRole('button', { name: /Example Tower/ }),
      { key: 'Enter' },
    )
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Just use address' })).toBeTruthy()
    await acceptLocation()
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'building',
        nameMode,
        address: expect.objectContaining({ coordinates: [114.1, 22.3] }),
      }),
    )
    await setLocationSync(false)
    expect(onUnlink).toHaveBeenCalledTimes(1)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Change linked location' }),
    )
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(onSelect).toHaveBeenCalledTimes(1)
  },
)

it('clears search with Escape and ignores a late provider response', async () => {
  vi.useRealTimers()
  let resolvePlaces!: (value: { rows: never[]; partial: boolean }) => void
  mocks.places.mockReturnValue(
    new Promise(resolve => {
      resolvePlaces = resolve
    }),
  )
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 1, onSelect: vi.fn() })
  const input = screen.getByRole('textbox') as HTMLInputElement
  await fireEvent.input(input, { target: { value: 'Martin' } })
  await waitFor(() => expect(mocks.places).toHaveBeenCalled())
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(input.value).toBe('')
  resolvePlaces({ rows: [], partial: false })
  await waitFor(() => expect(document.activeElement).toBe(input))
  expect(document.querySelectorAll('[data-result-id]')).toHaveLength(0)
})

it('groups co-located Building alternatives and confirms a cached building marker before association', async () => {
  vi.useRealTimers()
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
    overrides: {
      en: {
        buildingName: 'Hollywood Building',
        streetName: 'Hollywood Road',
        buildingNumberExpression: '188',
      },
    },
  }
  const buildings = ['186A', '188A'].map(number => ({
    id: `building:known:${number}`,
    kind: 'building' as const,
    names: { en: 'Hollywood Building' },
    buildingSource: { id: 'known', release: 'r1', addressId: number },
    address: {
      ...address,
      coordinates: [114.1501, 22.3] as [number, number],
      overrides: { en: { ...address.overrides.en, buildingNumberExpression: number } },
    },
  }))
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.buildings.mockResolvedValue(buildings)
  mocks.addresses.mockResolvedValue([{ addressMeta: { address } }])
  const onSelect = vi.fn(),
    onPreview = vi.fn(),
    onMapCandidates = vi.fn(),
    onResolutionPendingChange = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onPreview,
    onMapCandidates,
    onResolutionPendingChange,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'hollywood' } })
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(2),
  )
  expect(screen.getByText('2 addresses')).toBeTruthy()
  await fireEvent.click(
    document.querySelector<HTMLButtonElement>('[data-result-kind="address"]')!,
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Locate feature here' }))
  await fireEvent.click(screen.getByRole('radio', { name: 'Building' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Hollywood Building.*186A/ }),
  )
  expect(onSelect).not.toHaveBeenCalled()
  expect(onPreview).toHaveBeenLastCalledWith(buildings[0])
  expect(onResolutionPendingChange).toHaveBeenLastCalledWith(true)
  const move = screen.getByRole('button', { name: /Building Position$/ })
  expect(move.getAttribute('aria-pressed')).toBe('true')
  await fireEvent.click(move)
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onResolutionPendingChange).toHaveBeenLastCalledWith(false)
  expect(onSelect).toHaveBeenLastCalledWith(
    expect.objectContaining({
      buildingSource: { id: 'known', release: 'r1', addressId: '186A' },
      kind: 'building',
      nameMode: 'independent',
      address: expect.objectContaining({
        coordinates: buildings[0].address.coordinates,
      }),
    }),
  )
})

it('cross-references a building absent from discovery results without accepting it', async () => {
  vi.useRealTimers()
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
    overrides: {
      en: {
        buildingName: 'Hollywood Building',
        streetName: 'Hollywood Road',
        buildingNumberExpression: '188',
      },
    },
  }
  const target = {
    id: 'building:hidden',
    kind: 'building' as const,
    names: { en: 'Hollywood Building' },
    buildingSource: { id: 'hidden', release: 'r1' },
    address: { ...address, coordinates: [114.1501, 22.3] as [number, number] },
  }
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.buildings.mockResolvedValueOnce([]).mockResolvedValue([target])
  mocks.addresses.mockResolvedValue([{ addressMeta: { address } }])
  const onSelect = vi.fn(),
    onMapCandidates = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onMapCandidates,
  })
  await fireEvent.input(screen.getByRole('textbox'), {
    target: { value: '188 Hollywood' },
  })
  await fireEvent.click(
    await screen.findByRole('button', { name: /188.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Locate feature here' }))
  await fireEvent.click(screen.getByRole('radio', { name: 'Building' }))
  await screen.findByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
  expect(mocks.buildings).toHaveBeenLastCalledWith(
    'Hollywood Building',
    'en',
    expect.any(Function),
    expect.objectContaining({ coordinates: [114.15, 22.3], maxDistance: 100 }),
  )
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.queryByRole('radiogroup')).toBeNull()
})

it('offers an edited-name match on blur without accepting until the user confirms', async () => {
  vi.useRealTimers()
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
  }
  const target = {
    id: 'building:edited-name',
    kind: 'building' as const,
    names: { en: 'Edited Building' },
    buildingSource: { id: 'edited-name', release: 'r1' },
    address: { ...address, coordinates: [114.1501, 22.3] as [number, number] },
  }
  mocks.buildings.mockResolvedValue([target])
  const onSelect = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    currentAddress: address,
  })
  view.component.restoreProgress({
    query: '',
    findMode: 'search',
    filters: {},
    radius: 300,
    nearbyMode: false,
    includeShops: true,
    includeAddresses: true,
    includeBuildings: true,
    selected: {
      id: 'custom',
      kind: 'building',
      localKind: 'building',
      names: {},
      address,
    },
    accepted: true,
    linked: false,
    expandedGroup: null,
    receivedRows: [],
    previousRows: [],
    previousQuery: '',
    previousScrollTop: 0,
    searched: false,
  })
  await screen.findByRole('button', { name: 'Change linked location' })
  await fireEvent.click(screen.getByRole('button', { name: 'Change linked location' }))
  await fireEvent.click(screen.getByRole('radio', { name: 'Building' }))
  const input = screen.getByRole('textbox', { name: 'Building · Name' })
  await fireEvent.input(input, { target: { value: 'Edited Building' } })
  await fireEvent.blur(input)
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.click(await screen.findByRole('button', { name: /Edited Building/ }))
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'building',
      buildingSource: target.buildingSource,
    }),
  )
})

it.each(['establishment', 'building'] as const)(
  'keeps a nameless %s label distinct from its address after acceptance',
  async kind => {
    vi.useRealTimers()
    const address = {
      version: 1,
      matchStatus: 'unresolved',
      coordinates: [114.1, 22.3],
      overrides: {},
      source: {
        status: 'unresolved',
        rawSource: {},
        fallbackDisplay: { en: '57 WANG WO TSAI STREET' },
      },
    }
    mocks.places.mockResolvedValue({
      rows:
        kind === 'establishment'
          ? [
              {
                id: 'nameless',
                facts: {
                  names: {},
                  location: {
                    geometry: { type: 'Point', coordinates: address.coordinates },
                    address: address.source,
                  },
                },
              },
            ]
          : [],
      partial: false,
    })
    mocks.buildings.mockResolvedValueOnce(
      kind === 'building'
        ? [
            {
              id: 'building:nameless',
              kind,
              buildingSource: { id: 'nameless', release: 'r1' },
              names: {},
              address,
            },
          ]
        : [],
    )
    mocks.addresses.mockResolvedValue([])
    render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Wang Wo' } })
    const label =
      kind === 'establishment' ? 'Nameless Establishment' : 'Nameless Building'
    await fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(label) }),
    )
    await acceptLocation()
    await screen.findByRole('button', { name: 'Back to proposed location' })
    expect(screen.getByText(label)).toBeTruthy()
  },
)

it('pulses providers independently through completion, failure and stale responses', async () => {
  vi.useRealTimers()
  let resolvePlaces!: (value: unknown) => void
  let rejectAddresses!: (reason: Error) => void
  let resolveBuildings!: (value: unknown[]) => void
  mocks.places.mockReturnValueOnce(
    new Promise(resolve => {
      resolvePlaces = resolve
    }),
  )
  mocks.addresses.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectAddresses = reject
    }),
  )
  mocks.buildings.mockReturnValueOnce(
    new Promise(resolve => {
      resolveBuildings = resolve
    }),
  )
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  const input = screen.getByRole('textbox')
  const places = screen.getByRole('button', { name: 'Shops' })
  const buildings = screen.getByRole('button', { name: 'Building' })
  const addresses = screen.getByRole('button', { name: 'Address' })
  await fireEvent.input(input, { target: { value: 'first' } })
  await waitFor(() => expect(mocks.buildings).toHaveBeenCalled())
  for (const button of [places, buildings, addresses]) {
    expect(button.getAttribute('aria-busy')).toBe('true')
  }
  resolvePlaces({ rows: [], partial: false })
  await waitFor(() => expect(places.getAttribute('aria-busy')).toBe('false'))
  expect(buildings.getAttribute('aria-busy')).toBe('true')
  rejectAddresses(new Error('timeout'))
  await waitFor(() => expect(addresses.getAttribute('aria-busy')).toBe('false'))
  await fireEvent.input(input, { target: { value: 'second' } })
  resolveBuildings([])
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(buildings.getAttribute('aria-busy')).toBe('true')
  await fireEvent.keyDown(input, { key: 'Escape' })
  for (const button of [places, buildings, addresses])
    expect(button.getAttribute('aria-busy')).toBe('false')
})

it('keeps discovery controls closed after entering a manual address', async () => {
  vi.useRealTimers()
  const onAcceptedChange = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onAcceptedChange,
  })
  expect(screen.getByRole('textbox')).toBeTruthy()
  view.component.addManualLocation()
  await waitFor(() => expect(onAcceptedChange).toHaveBeenLastCalledWith(true))
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add Manual Entry' })).toBeNull()
})

it('highlights a hovered result over the focused row and restores focus highlighting on mouse leave', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    [0, 1].map(index => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: `focus-${index}`,
            fallbackDisplay: { en: `Focus Road ${index}` },
          },
          coordinates: [114.1, 22.3],
          matchStatus: 'unresolved',
          overrides: {},
        },
      },
    })),
  )
  const onMapCandidates = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Focus' } })
  const first = await screen.findByRole('button', { name: /1 Focus Road 0/ })
  const second = screen.getByRole('button', { name: /2 Focus Road 1/ })
  first.focus()
  await fireEvent.mouseEnter(second)
  await waitFor(() =>
    expect(view.container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(
      1,
    ),
  )
  expect(first.closest('[data-search-result]')?.getAttribute('data-highlighted')).toBe(
    'false',
  )
  expect(second.closest('[data-search-result]')?.getAttribute('data-highlighted')).toBe(
    'true',
  )
  await waitFor(() =>
    expect(
      onMapCandidates.mock.lastCall?.[0].filter(
        (row: { highlighted: boolean }) => row.highlighted,
      ),
    ).toHaveLength(1),
  )
  await fireEvent.mouseLeave(second)
  await waitFor(() =>
    expect(
      first.closest('[data-search-result]')?.getAttribute('data-highlighted'),
    ).toBe('true'),
  )
})

it('previews on repeated Enter and requires the explicit location action', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({
    partial: false,
    rows: [
      {
        id: 'diana',
        facts: {
          names: { en: 'Diana International Fur Factory' },
          classification: {
            basicCategory: 'shop',
            taxonomy: { primary: 'shop', hierarchy: ['shop'] },
          },
          location: {
            geometry: { type: 'Point', coordinates: [114.1, 22.3] },
            address: {
              status: 'unresolved',
              address2dId: null,
              address3dId: null,
              address3dUnitId: null,
              snapshotId: null,
              rawSource: {},
              fallbackDisplay: { en: '21 Man Lok Street' },
            },
          },
        },
      },
    ],
  })
  mocks.addresses.mockResolvedValue([])
  const onSelect = vi.fn()
  render(DraftSearch, { active: true, focusRequest: 0, onSelect })
  const input = screen.getByRole('textbox')
  await fireEvent.input(input, { target: { value: 'Diana' } })
  const result = await screen.findByRole('button', {
    name: /Diana International Fur Factory/,
  })
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(document.activeElement).toBe(result)
  expect(screen.getByRole('button', { name: 'Locate feature here' })).toBeTruthy()
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.keyDown(result, { key: 'Enter', repeat: true })
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.keyDown(result, { key: 'Enter' })
  expect(onSelect).not.toHaveBeenCalled()
  await acceptLocation()
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'place:diana', nameMode: undefined }),
    ),
  )
  expect(onSelect).toHaveBeenCalledTimes(1)
})

it('removes and guards Back to results once the accepted selection has been saved', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({
    rows: [
      {
        id: 'saved-place',
        facts: {
          names: { en: 'Saved Bakery' },
          location: {
            geometry: { type: 'Point', coordinates: [114.15, 22.3] },
            address: {
              status: 'unresolved',
              rawSource: {},
              fallbackDisplay: { en: '1 Road' },
            },
          },
        },
      },
    ],
    partial: false,
  })
  mocks.addresses.mockResolvedValue([])
  const onBack = vi.fn(),
    onSelect = vi.fn(),
    onAcceptedChange = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onBack,
    onAcceptedChange,
  })
  await fireEvent.input(screen.getByRole('textbox'), {
    target: { value: 'Saved Bakery' },
  })
  await fireEvent.click(await screen.findByRole('button', { name: /Saved Bakery/ }))
  expect(onSelect).not.toHaveBeenCalled()
  await acceptLocation()
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ nameMode: undefined }),
    ),
  )
  expect(screen.getByRole('button', { name: 'Back to proposed location' })).toBeTruthy()
  await view.rerender({ canReturnToResults: false })
  expect(screen.queryByRole('button', { name: 'Back to proposed location' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Change linked location' }))
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Back to location' }))
  expect(screen.queryByRole('radiogroup')).toBeNull()
  expect(onSelect).toHaveBeenCalledOnce()
  view.component.backToResults()
  expect(onBack).not.toHaveBeenCalled()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(onAcceptedChange).toHaveBeenLastCalledWith(true)
})

it.each([
  ['Building', 'building', { en: 'Wisdom Centre' }],
  ['Establishment', 'establishment', { en: 'New Cafe' }],
] as const)(
  'accepts %s from address evidence without an upstream identity',
  async (label, kind, names) => {
    vi.useRealTimers()
    mocks.places.mockResolvedValue({ rows: [], partial: false })
    mocks.buildings.mockResolvedValue([])
    mocks.addresses.mockResolvedValue([
      {
        addressMeta: {
          address: {
            version: 1,
            coordinates: [114.15, 22.3],
            matchStatus: 'resolved',
            overrides: {},
            source: {
              status: 'resolved',
              address2dId: 'address-only',
              rawSource: {
                data: {
                  attributes: {
                    i18n: {
                      en: {
                        buildingName: 'WISDOM CENTRE',
                        streetName: 'Hollywood Road',
                        buildingNumberExpression: '35',
                      },
                    },
                  },
                },
              },
              fallbackDisplay: {},
            },
          },
        },
      },
    ])
    const onSelect = vi.fn()
    render(DraftSearch, { active: true, focusRequest: 1, onSelect })
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Wisdom' } })
    const row = await screen.findByRole('button', {
      name: /Wisdom Centre.*35.*Hollywood Road/i,
    })
    await fireEvent.click(row)
    await fireEvent.click(screen.getByRole('button', { name: 'Locate feature here' }))
    await fireEvent.click(screen.getByRole('radio', { name: label }))
    await fireEvent.input(screen.getByRole('textbox', { name: `${label} · Name` }), {
      target: { value: names.en },
    })
    await fireEvent.click(screen.getByRole('button', { name: `Create new ${kind}` }))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind, localKind: kind, names, source: undefined }),
    )
    expect(onSelect.mock.calls[0][0].address.source.address2dId).toBe('address-only')
  },
)

it('requires a choice after repeated row clicks and restores the original cached result after local conversion', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.buildings.mockResolvedValue([])
  mocks.addresses.mockResolvedValue([
    {
      addressMeta: {
        address: {
          version: 1,
          coordinates: [114.15, 22.3],
          matchStatus: 'unresolved',
          overrides: {
            en: { streetName: 'Example Road', buildingNumberExpression: '12' },
          },
          source: {
            status: 'unresolved',
            rawSource: {},
            fallbackDisplay: {},
            address2dId: 'example-address',
          },
        },
      },
    },
  ])
  const onSelect = vi.fn(),
    onPreview = vi.fn(),
    onBack = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onPreview,
    onBack,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Example' } })
  const row = await screen.findByRole('button', { name: /12.*Example Road/ })
  await fireEvent.click(row)
  await fireEvent.click(row)
  await fireEvent.doubleClick(row)
  expect(onPreview).toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Link and use Name' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Just use address' })).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Locate feature here' }))
  await fireEvent.click(screen.getByRole('radio', { name: 'Building' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Building · Name' }), {
    target: { value: 'Example Building' },
  })
  await fireEvent.click(screen.getByRole('button', { name: `Create new building` }))
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'building',
      localKind: 'building',
      nameMode: 'independent',
    }),
  )
  const requests = [
    mocks.places.mock.calls.length,
    mocks.buildings.mock.calls.length,
    mocks.addresses.mock.calls.length,
  ]
  view.component.backToResults()
  await waitFor(() =>
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Example'),
  )
  expect(onBack).toHaveBeenCalledTimes(1)
  expect(
    document.querySelector('[data-result-id]')?.getAttribute('data-result-kind'),
  ).toBe('address')
  await fireEvent.click(screen.getByRole('button', { name: /12.*Example Road/ }))
  expect(screen.getByRole('button', { name: 'Just use address' })).toBeTruthy()
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect([
    mocks.places.mock.calls.length,
    mocks.buildings.mock.calls.length,
    mocks.addresses.mock.calls.length,
  ]).toEqual(requests)
})

// JSDOM lacks the observer used by the shared Firefox-safe text viewport.
beforeEach(() => {
  mocks.pages.mockReset().mockImplementation(async (input, options) => {
    const rows = await mocks.addresses(input, { signal: options?.signal })
    return { rows, total: rows.length, nextCursor: null, releaseSet: 'release' }
  })
  mocks.buildings.mockReset().mockResolvedValue([])
  mocks.buildingPages.mockReset().mockImplementation(async (query, locale, current) => {
    const rows = await mocks.buildings(query, locale, current)
    return { rows, total: rows.length, nextCursor: null }
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

it.each(['', 'Previous draft name'])(
  'preserves building candidate names with draft name %j through preview and return',
  async locationName => {
    vi.useRealTimers()
    mocks.places.mockResolvedValue({ rows: [], partial: false })
    mocks.addresses.mockResolvedValue([])
    mocks.buildings.mockResolvedValueOnce(
      ['HKU Library', 'HKU Laboratory'].map((name, index) => ({
        id: `building:hku-${index}`,
        kind: 'building',
        buildingSource: { id: `hku-${index}`, release: 'r1' },
        names: { en: name },
        address: {
          version: 1,
          matchStatus: 'unresolved',
          coordinates: [114.1, 22.3],
          overrides: {},
          source: { status: 'unresolved', rawSource: {}, fallbackDisplay: {} },
        },
      })),
    )
    const onSelect = vi.fn()
    const view = render(DraftSearch, {
      active: true,
      focusRequest: 0,
      onSelect,
      locationName,
    })
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'HKU' } })
    await fireEvent.click(await screen.findByRole('button', { name: /HKU Library/ }))
    expect(screen.getByRole('button', { name: /HKU Library/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /HKU Laboratory/ })).toBeTruthy()
    expect(screen.queryByText('Nameless Building')).toBeNull()
    await acceptLocation()
    await view.rerender({ locationName: 'Edited library' })
    expect(screen.getByText('Edited library')).toBeTruthy()
    await view.rerender({ locationName: '' })
    expect(screen.getByText('Nameless Building')).toBeTruthy()
    await fireEvent.click(
      screen.getByRole('button', { name: 'Back to proposed location' }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
    expect(await screen.findByRole('button', { name: /HKU Library/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /HKU Laboratory/ })).toBeTruthy()
    expect(screen.queryByText('Nameless Building')).toBeNull()
  },
)

it.each(['', 'HKU Space Po Leung Kuk Community College'])(
  'links an address Location without inferring a building when buildingName is %s',
  async buildingName => {
    vi.useRealTimers()
    mocks.places.mockResolvedValue({ rows: [], partial: false })
    mocks.buildings.mockResolvedValue([])
    mocks.addresses.mockResolvedValue([
      {
        addressMeta: {
          address: {
            version: 1,
            coordinates: [114.127, 22.271],
            matchStatus: 'unresolved',
            overrides: {
              en: {
                buildingName,
                streetName: 'Victoria Road',
                buildingNumberExpression: '285',
              },
            },
            source: {
              status: 'unresolved',
              rawSource: {},
              fallbackDisplay: {},
              address2dId: 'plain',
            },
          },
        },
      },
    ])
    const onSelect = vi.fn()
    const view = render(DraftSearch, { active: true, focusRequest: 0, onSelect })
    await fireEvent.input(screen.getByRole('textbox'), {
      target: { value: 'Victoria' },
    })
    await fireEvent.click(
      await screen.findByRole('button', { name: /285.*Victoria Road/ }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Just use address' }))
    expect(onSelect.mock.lastCall?.[0]).toMatchObject({
      kind: 'address',
      localKind: 'address',
      nameMode: 'independent',
      address: { source: { address2dId: 'plain' } },
    })
    expect(screen.queryByLabelText('Location options')).toBeNull()
    expect(
      screen.getByRole('combobox', { name: 'Location sync' }).textContent,
    ).toContain('Unsynced')
    await setLocationSync(true)
    const onUnlink = vi.fn()
    await view.rerender({ active: true, focusRequest: 0, onSelect, onUnlink })
    await setLocationSync(false)
    expect(onUnlink).toHaveBeenCalledOnce()
    expect(view.component.getProgress().linked).toBe(false)
    await acceptLocation()
    expect(view.component.getProgress().linked).toBe(true)
    expect(onSelect.mock.lastCall?.[0].localKind).toBe('address')
    expect(screen.getByText(/285 Victoria Road/)).toBeTruthy()
    await fireEvent.click(
      screen.getByRole('button', { name: 'Change linked location' }),
    )
    await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
    await fireEvent.input(
      screen.getByRole('textbox', { name: 'Establishment · Name' }),
      { target: { value: 'Custom Venue' } },
    )
    await fireEvent.click(
      screen.getByRole('button', { name: `Create new establishment` }),
    )
    await view.rerender({
      active: true,
      focusRequest: 0,
      onSelect,
      locationName: 'Custom Venue',
    })
    expect(screen.getByText('Custom Venue')).toBeTruthy()
    expect(onSelect.mock.lastCall?.[0]).toMatchObject({
      localKind: 'establishment',
      source: undefined,
      names: { en: 'Custom Venue' },
    })
  },
)

it('restores an accepted selection and retained results after remount without replaying selection', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([
    {
      addressMeta: {
        address: {
          version: 1,
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: 'resume-road',
            fallbackDisplay: { en: 'Resume Road' },
          },
          coordinates: [114.1, 22.3],
          matchStatus: 'unresolved',
          overrides: {},
        },
      },
    },
  ])
  const onSelect = vi.fn()
  const first = render(DraftSearch, { active: true, focusRequest: 0, onSelect })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Resume' } })
  await fireEvent.click(await screen.findByRole('button', { name: /Resume Road/ }))
  await fireEvent.click(screen.getByRole('button', { name: 'Just use address' }))
  const saved = JSON.parse(JSON.stringify(first.component.getProgress()))
  expect(saved.accepted).toBe(true)
  expect(saved.selected.address.source.address2dId).toBe('resume-road')
  cleanup()
  vi.clearAllMocks()
  const onBack = vi.fn()
  const onAcceptedChange = vi.fn()
  const second = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect,
    onBack,
    onAcceptedChange,
  })
  second.component.restoreProgress(saved)
  await waitFor(() => expect(onAcceptedChange).toHaveBeenLastCalledWith(true))
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(onSelect).not.toHaveBeenCalled()
  expect(mocks.addresses).not.toHaveBeenCalled()
  expect(mocks.places).not.toHaveBeenCalled()
  second.component.backToResults()
  await waitFor(() =>
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Resume'),
  )
  expect(await screen.findByRole('button', { name: /Resume Road/ })).toBeTruthy()
  expect(onBack).toHaveBeenCalledOnce()
})

it('resumes manual entry across remount and explicitly starts discovery over', async () => {
  vi.useRealTimers()
  const first = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
  })
  first.component.addManualLocation()
  const saved = JSON.parse(JSON.stringify(first.component.getProgress()))
  cleanup()
  const onAcceptedChange = vi.fn()
  const second = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onAcceptedChange,
  })
  second.component.restoreProgress(saved)
  await waitFor(() => expect(onAcceptedChange).toHaveBeenLastCalledWith(true))
  expect(screen.queryByRole('textbox')).toBeNull()
  second.component.restoreProgress(null)
  await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
  expect(onAcceptedChange).toHaveBeenLastCalledWith(false)
  expect(second.component.getProgress()).toMatchObject({
    accepted: false,
    selected: null,
    query: '',
    receivedRows: [],
  })
})

it('loads one continuation near the scroll end, retaining rows, focus and map candidates', async () => {
  vi.useRealTimers()
  const address = (id: string) => ({
    addressMeta: {
      address: {
        ...emptyFeatureAddress({ en: `Road ${id}` }),
        coordinates: [114.15 + Number(id) / 10000, 22.3] as [number, number],
        source: {
          ...emptyFeatureAddress().source,
          address2dId: id,
          fallbackDisplay: { en: `Road ${id}` },
        },
      },
    },
  })
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  let finish!: (value: unknown) => void
  mocks.pages
    .mockResolvedValueOnce({
      rows: [address('1'), address('2')],
      total: 4,
      nextCursor: 'next',
      releaseSet: 'release',
    })
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
  const onMapCandidates = vi.fn()
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  const input = screen.getByRole('textbox') as HTMLInputElement
  input.value = 'Road'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const first = await screen.findByRole('button', { name: /Road 1/ })
  const list = first.closest('section')!
  await waitFor(() => expect(list.parentElement).toHaveAttribute('aria-busy', 'false'))
  Object.defineProperties(list, {
    clientHeight: { value: 300, configurable: true },
    scrollHeight: { value: 1800, configurable: true },
  })
  pagingViewport(list, { address: 1800 })
  first.focus()
  list.dispatchEvent(new Event('scroll'))
  expect(mocks.pages).toHaveBeenCalledTimes(1)
  list.scrollTop = 1500
  list.dispatchEvent(new Event('scroll'))
  list.dispatchEvent(new Event('scroll'))
  await waitFor(() => expect(mocks.pages).toHaveBeenCalledTimes(2))
  expect(mocks.pages).toHaveBeenLastCalledWith(
    { address: 'Road' },
    { cursor: 'next', releaseSet: 'release', signal: expect.any(AbortSignal) },
  )
  finish({
    rows: [address('2'), address('3'), address('4')],
    total: 4,
    nextCursor: null,
    releaseSet: 'release',
  })
  await waitFor(() =>
    expect(document.querySelectorAll('[data-result-id]')).toHaveLength(4),
  )
  expect(screen.getByText('4 of 4 addresses loaded')).toBeTruthy()
  expect(onMapCandidates.mock.calls.at(-1)?.[0]).toHaveLength(4)
  expect(
    document.querySelector('[data-search-result]')?.getAttribute('data-highlighted'),
  ).toBe('true')
})

it('discards a stale continuation after the query changes', async () => {
  vi.useRealTimers()
  const address = (id: string) => ({
    addressMeta: {
      address: {
        ...emptyFeatureAddress({ en: id }),
        coordinates: [114.15, 22.3] as [number, number],
      },
    },
  })
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  let finish!: (value: unknown) => void
  mocks.pages
    .mockResolvedValueOnce({
      rows: [address('Old Road')],
      total: 2,
      nextCursor: 'next',
      releaseSet: 'release',
    })
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce({
      rows: [address('New Road')],
      total: 1,
      nextCursor: null,
      releaseSet: 'new-release',
    })
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  const input = screen.getByRole('textbox')
  ;(input as HTMLInputElement).value = 'Old'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const list = (await screen.findByRole('button', { name: /Old Road/ })).closest(
    'section',
  )!
  await waitFor(() => expect(list.parentElement).toHaveAttribute('aria-busy', 'false'))
  Object.defineProperties(list, {
    clientHeight: { value: 300, configurable: true },
    scrollHeight: { value: 1000, configurable: true },
  })
  list.scrollTop = 700
  list.dispatchEvent(new Event('scroll'))
  await waitFor(() => expect(mocks.pages).toHaveBeenCalledTimes(2))
  ;(input as HTMLInputElement).value = 'New'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  finish({
    rows: [address('Stale Road')],
    total: 2,
    nextCursor: null,
    releaseSet: 'release',
  })
  await screen.findByRole('button', { name: /New Road/ })
  expect(screen.queryByRole('button', { name: /Stale Road/ })).toBeNull()
})

it('retries the same cursor after a transport error and explicitly restarts expired searches', async () => {
  vi.useRealTimers()
  const address = {
    addressMeta: {
      address: {
        ...emptyFeatureAddress({ en: 'Retry Road' }),
        coordinates: [114.15, 22.3] as [number, number],
      },
    },
  }
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.pages
    .mockResolvedValueOnce({
      rows: [address],
      total: 2,
      nextCursor: 'same-cursor',
      releaseSet: 'release',
    })
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new GeocodeRequestError(410))
    .mockResolvedValueOnce({
      rows: [address],
      total: 1,
      nextCursor: null,
      releaseSet: 'new-release',
    })
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  const input = screen.getByRole('textbox') as HTMLInputElement
  input.value = 'Retry'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const list = (await screen.findByRole('button', { name: /Retry Road/ })).closest(
    'section',
  )!
  await waitFor(() => expect(list.parentElement).toHaveAttribute('aria-busy', 'false'))
  Object.defineProperties(list, {
    clientHeight: { value: 300, configurable: true },
    scrollHeight: { value: 1000, configurable: true },
  })
  list.scrollTop = 700
  list.dispatchEvent(new Event('scroll'))
  const retry = await screen.findByRole('button', { name: 'Retry loading' })
  expect(screen.getByRole('button', { name: /Retry Road/ })).toBeTruthy()
  list.dispatchEvent(new Event('scroll'))
  expect(mocks.pages).toHaveBeenCalledTimes(2)
  retry.click()
  const restart = await screen.findByRole('button', { name: 'Search again' })
  expect(mocks.pages.mock.calls[1]).toEqual(mocks.pages.mock.calls[2])
  expect(screen.getByRole('button', { name: /Retry Road/ })).toBeTruthy()
  restart.click()
  await waitFor(() => expect(screen.getByText('1 of 1 addresses loaded')).toBeTruthy())
  expect(mocks.pages.mock.calls[3]![1]).not.toHaveProperty('cursor')
})

it('preserves other providers and cached rows when toggling a pending type', async () => {
  vi.useRealTimers()
  let resolvePlaces!: (value: unknown) => void
  mocks.places.mockReturnValue(
    new Promise(resolve => {
      resolvePlaces = resolve
    }),
  )
  mocks.buildings.mockResolvedValue([])
  mocks.addresses.mockResolvedValue([
    {
      addressMeta: {
        address: {
          ...emptyFeatureAddress(),
          source: {
            rawSource: {},
            status: 'unresolved',
            address2dId: 'partial',
            fallbackDisplay: { en: 'Partial Road' },
          },
          coordinates: [114.1, 22.3],
        },
      },
    },
  ])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Partial' } })
  await screen.findByRole('button', { name: /Partial Road/ })
  const signal = mocks.addresses.mock.lastCall?.[1].signal
  const shops = screen.getByRole('button', { name: 'Shops' })
  expect(shops).not.toHaveAttribute('disabled')
  expect(shops.getAttribute('aria-busy')).toBe('true')
  const row = screen.getByRole('button', { name: /Partial Road/ })
  await fireEvent.click(shops)
  expect(screen.getByRole('button', { name: /Partial Road/ })).toBe(row)
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Partial')
  expect(signal.aborted).toBe(false)
  expect(shops.getAttribute('aria-pressed')).toBe('false')
  expect(shops.getAttribute('aria-busy')).toBe('false')
  resolvePlaces({ rows: [], partial: false })
  await new Promise(resolve => setTimeout(resolve, 350))
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
  expect(mocks.places).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: /Partial Road/ })).toBeTruthy()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Address' }).getAttribute('aria-busy'),
    ).toBe('false'),
  )
  await fireEvent.click(shops)
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(2))
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
  expect(mocks.buildings).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: /Partial Road/ })).toBe(row)
  const addresses = screen.getByRole('button', { name: 'Address' })
  await fireEvent.click(addresses)
  expect(screen.queryByRole('button', { name: /Partial Road/ })).toBeNull()
  await fireEvent.click(addresses)
  expect(screen.getByRole('button', { name: /Partial Road/ })).toBeTruthy()
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
})

it('retries an uncached provider when re-enabled after a failed search', async () => {
  vi.useRealTimers()
  mocks.places
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  mocks.buildings.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'hollywood' } })
  const shops = screen.getByRole('button', { name: 'Shops' })
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(shops.getAttribute('aria-busy')).toBe('false'))
  await fireEvent.click(shops)
  await fireEvent.click(shops)
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(shops.getAttribute('aria-busy')).toBe('false'))
  // A successful empty response is cached too, so toggling it again needs no request.
  await fireEvent.click(shops)
  await fireEvent.click(shops)
  await new Promise(resolve => setTimeout(resolve, 400))
  expect(mocks.places).toHaveBeenCalledTimes(2)
})

it('keeps unrelated pending providers alive when another type is disabled', async () => {
  vi.useRealTimers()
  let resolveAddresses!: (value: unknown[]) => void
  mocks.addresses.mockReturnValue(
    new Promise(resolve => {
      resolveAddresses = resolve
    }),
  )
  mocks.places.mockReturnValue(new Promise(() => {}))
  mocks.buildings.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'ongoing' } })
  await waitFor(() => expect(mocks.addresses).toHaveBeenCalledTimes(1))
  const signal = mocks.addresses.mock.lastCall?.[1].signal
  await fireEvent.click(screen.getByRole('button', { name: 'Shops' }))
  expect(signal.aborted).toBe(false)
  expect(
    screen.getByRole('button', { name: 'Address' }).getAttribute('aria-busy'),
  ).toBe('true')
  resolveAddresses([])
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Address' }).getAttribute('aria-busy'),
    ).toBe('false'),
  )
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
})

it('moves the accepted numbered marker with its corrected address and restores its point without editing source rows', async () => {
  vi.useRealTimers()
  const original = {
    ...emptyFeatureAddress({ en: '79 Hollywood Road' }),
    coordinates: [114.15, 22.28] as [number, number],
  }
  const other = {
    ...emptyFeatureAddress({ en: '2 Other Road' }),
    coordinates: [114.16, 22.29] as [number, number],
  }
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([
    { addressMeta: { address: original } },
    { addressMeta: { address: other } },
  ])
  const onMapCandidates = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    onSelect: vi.fn(),
    onMapCandidates,
  })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Road' } })
  await fireEvent.click(
    await screen.findByRole('button', { name: /79 Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Just use address' }))
  const selectedId = view.component.getProgress().selected!.id
  const corrected = {
    ...emptyFeatureAddress({ en: '77-81 Hollywood Road' }),
    coordinates: [114.1526, 22.2835] as [number, number],
  }
  view.component.adoptAddressChange(corrected)
  await waitFor(() =>
    expect(
      onMapCandidates.mock.lastCall?.[0].find(
        (marker: { selected?: boolean }) => marker.selected,
      ),
    ).toMatchObject({
      id: selectedId,
      number: 1,
      coordinates: corrected.coordinates,
      label: '77-81 Hollywood Road',
    }),
  )
  expect(view.component.getProgress().receivedRows[0].address.coordinates).toEqual(
    original.coordinates,
  )
  view.component.syncSelectedAddress(original)
  await waitFor(() =>
    expect(
      onMapCandidates.mock.lastCall?.[0].find(
        (marker: { selected?: boolean }) => marker.selected,
      ),
    ).toMatchObject({ id: selectedId, number: 1, coordinates: original.coordinates }),
  )
})

it.each([
  { sourceBacked: false, enabled: 'Open to Sync', mode: 'unlinked' },
  { sourceBacked: true, enabled: 'Synced', mode: 'linked' },
])(
  'toggles Unsynced to $enabled using upstream identity, preserving kind, names and edits',
  async ({ sourceBacked, enabled, mode }) => {
    vi.useRealTimers()
    const address = {
      ...emptyFeatureAddress(),
      coordinates: [114.15, 22.3] as [number, number],
      overrides: { en: { streetName: 'Reviewed Road' } },
      association: {
        originKind: 'address' as const,
        kind: 'premises' as const,
        mode: 'manual' as const,
        lookup: 'not-checked' as const,
        names: { en: 'New Haven Court' },
      },
    }
    const selected = {
      id: 'local:court',
      kind: 'premises' as const,
      localKind: 'premises' as const,
      names: { en: 'New Haven Court' },
      identity: {
        locationId: 'court',
        revisionId: 'r1',
        ...(sourceBacked ? { ssId: 'source-court' } : {}),
      },
      address,
    }
    const onSelect = vi.fn(),
      onUnlink = vi.fn()
    const view = render(DraftSearch, {
      active: true,
      focusRequest: 0,
      currentAddress: address,
      onSelect,
      onUnlink,
    })
    view.component.restoreProgress({
      query: '',
      findMode: 'search',
      filters: {},
      radius: 300,
      nearbyMode: false,
      includeShops: true,
      includeAddresses: true,
      includeBuildings: true,
      selected,
      accepted: true,
      linked: true,
      expandedGroup: null,
      receivedRows: [],
      previousRows: [],
      previousQuery: '',
      previousScrollTop: 0,
      searched: false,
    })
    const control = await screen.findByRole('combobox', { name: 'Location sync' })
    expect(control.textContent).toContain('Unsynced')
    await fireEvent.click(control)
    expect(
      screen
        .getAllByRole('option', { hidden: true })
        .map(option => option.textContent?.trim()),
    ).toEqual([enabled, 'Unsynced'])
    await fireEvent.keyDown(control, { key: 'Home' })
    await fireEvent.keyDown(control, { key: 'Enter' })
    expect(onSelect.mock.lastCall?.[0]).toMatchObject({
      kind: 'premises',
      names: selected.names,
      identity: selected.identity,
      address: {
        overrides: address.overrides,
        association: { mode, kind: 'premises' },
      },
    })
    expect(onUnlink).not.toHaveBeenCalled()
    expect(control.textContent).toContain(enabled)
    await setLocationSync(false)
    expect(onUnlink).toHaveBeenCalledOnce()
    await setLocationSync(true)
    expect(onSelect.mock.lastCall?.[0].address.association.mode).toBe(mode)
  },
)

/** Build distinct Place previews so paging tests exercise rows rather than grouped alternatives. */
function pagedPlace(id: number) {
  return {
    id: String(id),
    resourceReleaseId: 'release',
    facts: {
      names: { en: `Paged Shop ${id}` },
      location: {
        geometry: { type: 'Point', coordinates: [114.15 + id / 10000, 22.3] },
        address: {
          status: 'unresolved',
          rawSource: {},
          fallbackDisplay: { en: `Shop Street ${id}` },
        },
      },
    },
  }
}
/** Give JSDOM real viewport boundaries while keeping later providers below the fold. */
function pagingViewport(
  list: HTMLElement,
  positions: Partial<Record<string, number>>,
): void {
  Object.defineProperties(list, {
    clientHeight: { value: 300, configurable: true },
    scrollHeight: { value: 3000, configurable: true },
  })
  vi.spyOn(list, 'getBoundingClientRect').mockImplementation(
    () => ({ top: 0, bottom: 300 }) as DOMRect,
  )
  for (const sentinel of list.querySelectorAll<HTMLElement>('[data-pagination-kind]')) {
    vi.spyOn(sentinel, 'getBoundingClientRect').mockImplementation(() => {
      const top = (positions[sentinel.dataset.paginationKind!] ?? 2500) - list.scrollTop
      return { top, bottom: top + 24 } as DOMRect
    })
  }
}

it('lazy loads Places at their own boundary, once per cursor, and appends without duplicates or scroll reset', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValueOnce({
    rows: Array.from({ length: 20 }, (_, i) => pagedPlace(i)),
    partial: false,
    nextCursor: 'places-2',
  })
  let finish!: (page: unknown) => void
  mocks.places.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  mocks.buildingPages.mockResolvedValueOnce({
    rows: [
      {
        id: 'building:b',
        kind: 'building',
        names: { en: 'Paged Tower' },
        address: emptyFeatureAddress(),
        buildingSource: { id: 'b', release: 'r' },
      },
    ],
    total: 20,
    nextCursor: 'buildings-2',
  })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Paged' } })
  const row = await screen.findByRole('button', { name: /Paged Shop 19/ })
  const list = row.closest('section')!
  pagingViewport(list, { establishment: 600, building: 2000 })
  list.scrollTop = 50
  await fireEvent.scroll(list)
  expect(mocks.places).toHaveBeenCalledTimes(1)
  list.scrollTop = 400
  await fireEvent.scroll(list)
  await fireEvent.scroll(list)
  expect(mocks.places).toHaveBeenCalledTimes(2)
  expect(mocks.places.mock.calls[1][0]).toMatchObject({
    q: 'Paged',
    cursor: 'places-2',
    limit: 20,
  })
  expect(mocks.buildingPages).toHaveBeenCalledTimes(1)
  expect(document.querySelectorAll('[data-result-kind="establishment"]')).toHaveLength(
    20,
  )
  finish({
    rows: [pagedPlace(19), ...Array.from({ length: 20 }, (_, i) => pagedPlace(i + 20))],
    partial: false,
    nextCursor: null,
  })
  await waitFor(() =>
    expect(
      document.querySelectorAll('[data-result-kind="establishment"]'),
    ).toHaveLength(40),
  )
  expect(list.scrollTop).toBe(400)
  await fireEvent.scroll(list)
  expect(mocks.places).toHaveBeenCalledTimes(2)
})

it('retries the same Place cursor after failure and ignores a page from an older query', async () => {
  vi.useRealTimers()
  mocks.places
    .mockResolvedValueOnce({
      rows: [pagedPlace(1)],
      partial: false,
      nextCursor: 'retry-page',
    })
    .mockRejectedValueOnce(new Error('offline'))
  let finish!: (page: unknown) => void
  mocks.places
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce({ rows: [pagedPlace(99)], partial: false, nextCursor: null })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Old' } })
  const list = (await screen.findByRole('button', { name: /Paged Shop 1/ })).closest(
    'section',
  )!
  pagingViewport(list, { establishment: 400 })
  list.scrollTop = 200
  await fireEvent.scroll(list)
  const retry = await screen.findByRole('button', { name: 'Retry loading' })
  await fireEvent.scroll(list)
  expect(mocks.places).toHaveBeenCalledTimes(2)
  await fireEvent.click(retry)
  expect(mocks.places.mock.calls[2][0]).toEqual(mocks.places.mock.calls[1][0])
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'New' } })
  finish({ rows: [pagedPlace(2)], partial: false, nextCursor: 'obsolete' })
  await screen.findByRole('button', { name: /Paged Shop 99/ })
  expect(screen.queryByRole('button', { name: /Paged Shop 2/ })).toBeNull()
})

it('continues Building details at their boundary and retains loaded Places', async () => {
  vi.useRealTimers()
  const building = (id: number) => ({
    id: `building:${id}`,
    kind: 'building',
    names: { en: `Paged Tower ${id}` },
    address: { ...emptyFeatureAddress(), coordinates: [114.1 + id / 100, 22.3] },
    buildingSource: { id: String(id), release: 'r' },
  })
  mocks.places.mockResolvedValueOnce({
    rows: [pagedPlace(1)],
    partial: false,
    nextCursor: null,
  })
  mocks.buildingPages
    .mockResolvedValueOnce({
      rows: [building(1)],
      total: 2,
      nextCursor: 'building-next',
    })
    .mockResolvedValueOnce({ rows: [building(2)], total: 2, nextCursor: null })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Paged' } })
  const list = (await screen.findByRole('button', { name: /Paged Tower 1/ })).closest(
    'section',
  )!
  pagingViewport(list, { building: 500 })
  list.scrollTop = 300
  await fireEvent.scroll(list)
  await screen.findByRole('button', { name: /Paged Tower 2/ })
  expect(mocks.buildingPages.mock.calls[1][3]).toBe('building-next')
  expect(screen.getByRole('button', { name: /Paged Shop 1/ })).toBeTruthy()
  expect(mocks.places).toHaveBeenCalledTimes(1)
})

it('continues empty filtered Place pages and stops while Places are hidden', async () => {
  vi.useRealTimers()
  mocks.places
    .mockResolvedValueOnce({ rows: [], partial: false, nextCursor: 'empty-next' })
    .mockResolvedValueOnce({
      rows: [pagedPlace(1)],
      partial: false,
      nextCursor: 'hidden-next',
    })
  let finish!: (page: unknown) => void
  mocks.places.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  mocks.addresses.mockResolvedValue([])
  const view = render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Paged' } })
  const more = await screen.findByRole('button', { name: 'Load more' })
  const list = more.closest('section')!
  expect(screen.queryByText('No matching locations found.')).toBeNull()
  pagingViewport(list, { establishment: 200 })
  await fireEvent.scroll(list)
  await screen.findByRole('button', { name: /Paged Shop 1/ })
  await waitFor(() => expect(mocks.places).toHaveBeenCalledTimes(3))
  await fireEvent.click(screen.getByRole('button', { name: 'Shops' }))
  finish({ rows: [pagedPlace(2)], partial: false, nextCursor: null })
  await fireEvent.scroll(list)
  expect(mocks.places).toHaveBeenCalledTimes(3)
  expect(view.component.getProgress().receivedRows.map(row => row.id)).toEqual([
    'place:1',
  ])
})

it('returns from the accepted editor to its proposal before returning to results', async () => {
  vi.useRealTimers()
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
    overrides: { en: { streetName: 'Reviewed Road' } },
  }
  const chosen = {
    id: 'building:reviewed',
    kind: 'building' as const,
    names: { en: 'Reviewed Building' },
    buildingSource: { id: 'reviewed', release: 'r' },
    address,
  }
  const onBack = vi.fn(),
    onSelect = vi.fn(),
    onResolutionPendingChange = vi.fn()
  const view = render(DraftSearch, {
    active: true,
    focusRequest: 0,
    currentAddress: address,
    onSelect,
    onBack,
    onResolutionPendingChange,
  })
  view.component.restoreProgress({
    query: 'Reviewed',
    findMode: 'search',
    filters: {},
    radius: 300,
    nearbyMode: false,
    includeShops: true,
    includeAddresses: true,
    includeBuildings: true,
    selected: chosen,
    accepted: true,
    linked: true,
    expandedGroup: null,
    receivedRows: [chosen],
    previousRows: [chosen],
    previousQuery: 'Reviewed',
    previousScrollTop: 0,
    searched: false,
  })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Back to proposed location' }),
  )
  await screen.findByText('Proposed location')
  expect(document.querySelector('[data-association-toolbar]')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  expect(onBack).not.toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
  await waitFor(() => expect(onResolutionPendingChange).toHaveBeenLastCalledWith(true))
  await fireEvent.click(screen.getByRole('button', { name: 'Use' }))
  await screen.findByRole('button', { name: 'Back to proposed location' })
  expect(onSelect.mock.lastCall?.[0].buildingSource).toEqual(chosen.buildingSource)
  await fireEvent.click(
    screen.getByRole('button', { name: 'Back to proposed location' }),
  )
  await fireEvent.click(await screen.findByRole('button', { name: 'Back to results' }))
  expect(onBack).toHaveBeenCalledOnce()
})

it('derives nearby buildings from reverse addresses and retains successful building providers', async () => {
  const address = emptyFeatureAddress()
  address.overrides.en = { buildingName: 'Por Mee Factory Building' }
  const other = emptyFeatureAddress()
  other.overrides.en = { buildingName: 'Unavailable Tower' }
  mocks.addresses.mockResolvedValue([
    { addressMeta: { address } },
    { addressMeta: { address: other } },
  ])
  mocks.nearby.mockResolvedValue({ rows: [], partial: false })
  mocks.buildings.mockImplementation(async name => {
    if (name === 'Unavailable Tower') throw Error('unavailable')
    return [
      {
        id: 'por-mee',
        kind: 'building',
        names: { en: 'Por Mee Factory Building' },
        address,
      },
    ]
  })
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    coordinates: [114.152, 22.34],
    hasPin: true,
    searchRequest: { id: 1, mode: 'pin', query: '' },
    onSelect: vi.fn(),
  })
  await waitFor(() =>
    expect(mocks.buildings).toHaveBeenCalledWith(
      'Por Mee Factory Building',
      'en',
      expect.any(Function),
      expect.objectContaining({ coordinates: [114.152, 22.34], maxDistance: 300 }),
    ),
  )
  expect(
    await screen.findByRole('button', { name: /Por Mee Factory Building/ }),
  ).toBeTruthy()
})

it('matches an existing feature from an explicit search request without offering manual creation', async () => {
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, {
    active: true,
    focusRequest: 0,
    allowManualEntry: false,
    searchRequest: { id: 1, mode: 'search', query: 'Clockwork Cat' },
    onSelect: vi.fn(),
  })
  await waitFor(() =>
    expect(mocks.places).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Clockwork Cat', filters: {} }),
    ),
  )
  expect(screen.queryByRole('button', { name: /Create Location/i })).toBeNull()
})
