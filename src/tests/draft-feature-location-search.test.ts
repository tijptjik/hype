// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
// JSDOM does not implement the Web Animations API used by Svelte flip.
Element.prototype.animate = () => ({ cancel() {} }) as Animation
Element.prototype.getAnimations = () => []
Element.prototype.scrollTo = () => {}
vi.mock('svelte/transition', () => ({ fly: () => ({ duration: 0 }) }))
const mocks = vi.hoisted(() => ({
  places: vi.fn(),
  addresses: vi.fn(),
  nearby: vi.fn(),
}))
vi.mock('#lib/api/draftLocation.remote.js', () => ({
  searchDraftLocations: mocks.places,
  searchNearbyDraftLocations: mocks.nearby,
}))
vi.mock('#lib/addresses/nameCatalogue.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/addresses/nameCatalogue.js')>()),
  loadAddressNames: vi.fn().mockResolvedValue([]),
}))
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionLabel: () => ({ current: null }),
}))
vi.mock('#lib/api/external/geocoding.js', () => ({
  geocodeAddressCandidates: mocks.addresses,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('focuses after navigation, searches while typing and returns the selected editable draft', async () => {
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
        addressSnapshotId: null,
        records: {},
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
  await fireEvent.click(await screen.findByRole('button', { name: /Test Bakery/ }))
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Link and use Name' }))
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
            records: {},
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
})

it('shows provider failures instead of an empty-match message and retries', async () => {
  vi.useRealTimers()
  mocks.places.mockRejectedValue(new Error('unavailable'))
  mocks.addresses.mockRejectedValue(new Error('timeout'))
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Kirby' } })
  const retry = await screen.findByRole('button', { name: /retry/i })
  expect(screen.queryByText(/no matching/i)).toBeNull()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  await fireEvent.click(retry)
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull(),
  )
  expect(mocks.places).toHaveBeenCalledTimes(2)
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
            records: {},
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
  expect(screen.queryByRole('button', { name: /Fast Road/ })).toBeNull()
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
            address: { status: 'unresolved', records: {}, fallbackDisplay: {} },
          },
        },
      },
    ],
  })
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Fast' } })
  await fireEvent.click(await screen.findByRole('button', { name: /Fast Place/ }))
  resolveAddresses([])
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(screen.queryByText(/no matching/i)).toBeNull()
  expect(screen.queryByRole('button', { name: /Fast Place/ })).not.toBeNull()
})

it('restores the previous results and map numbers after an incorrect selection without refetching', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([
    {
      addressMeta: {
        address: {
          version: 1,
          source: {
            records: {},
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
  expect(screen.getByText('Hollywood Terrace, 123 Hollywood Rd')).toBeTruthy()
  await waitFor(() =>
    expect(onMapCandidates.mock.lastCall?.[0][0]).toMatchObject({
      number: 1,
      id: 'address:hollywood:114.15,22.28',
    }),
  )
  await fireEvent.click(row)
  await fireEvent.click(screen.getByRole('button', { name: /back to results/i }))
  expect(onBack).not.toHaveBeenCalled()
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('hollywood')
  expect(
    (await screen.findByRole('button', { name: /Hollywood Terrace/ })).dataset
      .resultNumber,
  ).toBe('1')
  await waitFor(() => expect(onMapCandidates.mock.lastCall?.[0]).toHaveLength(1))
  expect(mocks.addresses).toHaveBeenCalledTimes(1)
})

it('only requests enabled search types and keeps Building disabled', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue([])
  render(DraftSearch, { active: true, focusRequest: 0, onSelect: vi.fn() })
  const shops = screen.getByRole('button', { name: 'Shops' })
  const addresses = screen.getByRole('button', { name: 'Address' })
  expect(
    (screen.getByRole('button', { name: 'Building' }) as HTMLButtonElement).disabled,
  ).toBe(true)
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
  expect(
    (screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled,
  ).toBe(true)
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

it('retains all markers during preview and restores results without a request', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    [0, 1].map(index => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            records: {},
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
  await fireEvent.click(row)
  await waitFor(() => {
    const markers = onMapCandidates.mock.lastCall?.[0]
    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({ selected: true, hidden: false })
    expect(markers[1]).toMatchObject({ selected: false, hidden: false })
  })
  await fireEvent.click(screen.getByRole('button', { name: /back to results/i }))
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
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Place filters' }).textContent).toContain(
    '1',
  )
})

it('renumbers the list and map when establishments arrive after addresses', async () => {
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
            records: {},
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
  resolvePlaces({
    partial: false,
    rows: [
      {
        id: 'shop',
        facts: {
          names: { en: 'Late Shop' },
          location: {
            geometry: { type: 'Point', coordinates: [114.2, 22.3] },
            address: { status: 'unresolved', records: {}, fallbackDisplay: {} },
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
})

it('expands a premises group in numeric order, then previews without accepting', async () => {
  vi.useRealTimers()
  mocks.places.mockResolvedValue({ rows: [], partial: false })
  mocks.addresses.mockResolvedValue(
    ['219', '209-223', '211'].map(number => ({
      addressMeta: {
        address: {
          version: 1,
          source: {
            status: 'unresolved',
            records: {},
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
    onPreview = vi.fn()
  render(DraftSearch, { active: true, focusRequest: 0, onSelect, onPreview })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Curios' } })
  await fireEvent.click(await screen.findByRole('button', { name: /3 addresses/ }))
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-result-id]')]
  expect(buttons.map(button => button.dataset.resultId?.split(':')[1])).toEqual([
    '209-223',
    '211',
    '219',
  ])
  expect(onPreview).not.toHaveBeenCalled()
  await fireEvent.click(buttons[0])
  expect(onPreview).toHaveBeenCalledTimes(1)
  expect(onSelect).not.toHaveBeenCalled()
  await fireEvent.click(screen.getAllByRole('button', { name: 'Use Address' })[0])
  expect(onSelect).toHaveBeenCalledTimes(1)
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
              records: {},
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
    onBack = vi.fn()
  render(DraftSearch, { active: true, focusRequest: 0, onSelect, onUnlink, onBack })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Bakery' } })
  await fireEvent.click(await screen.findByRole('button', { name: /Bakery/ }))
  await fireEvent.click(screen.getByRole('button', { name: 'Link and use Name' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(onUnlink).toHaveBeenCalledTimes(1)
  expect(onBack).not.toHaveBeenCalled()
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
    retry: true,
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
              address: { status: 'unresolved', records: {}, fallbackDisplay: {} },
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
            records: {},
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
  await fireEvent.click(await screen.findByRole('button', { name: /2 addresses/ }))
  const first = document.querySelector<HTMLButtonElement>('[data-result-id]')!
  first.focus()
  await fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Back to results' }),
  )
})

it('Link Place explicitly keeps Feature names independent', async () => {
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
            address: { status: 'unresolved', records: {}, fallbackDisplay: {} },
          },
        },
      },
    ],
    partial: false,
  })
  mocks.addresses.mockResolvedValue([])
  const onSelect = vi.fn()
  render(DraftSearch, { active: true, focusRequest: 0, onSelect })
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Place' } })
  expect(screen.queryByRole('button', { name: 'Link Place' })).toBeNull()
  await fireEvent.click(await screen.findByRole('button', { name: /Place name/ }))
  await fireEvent.click(await screen.findByRole('button', { name: 'Link Place' }))
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
          address: { status: 'unresolved', records: {}, fallbackDisplay: {} },
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
  await fireEvent.click(last)
  const actions = document.querySelectorAll<HTMLButtonElement>(
    '[data-result-actions="place:tab-2"] button',
  )
  expect(actions.length).toBe(2)
  await fireEvent.keyDown(last, { key: 'Tab' })
  await fireEvent.keyDown(actions[0], { key: 'Tab' })
  expect(onResultsEnd).toHaveBeenCalledTimes(1)
  await fireEvent.keyDown(actions[1], { key: 'Tab' })
  expect(onResultsEnd).toHaveBeenCalledTimes(2)
})

it('guides name, map and manual entry with distinct controls', async () => {
  vi.useRealTimers()
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
  await fireEvent.click(screen.getByRole('button', { name: 'Add Manual Entry' }))
  expect(onManualEntry).toHaveBeenCalledTimes(1)
})
