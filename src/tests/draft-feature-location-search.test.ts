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
Element.prototype.getAnimations = () => []
const mocks = vi.hoisted(() => ({ places: vi.fn(), addresses: vi.fn() }))
vi.mock('#lib/api/draftLocation.remote.js', () => ({
  searchDraftLocations: mocks.places,
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
  await fireEvent.click(await screen.findByRole('button', { name: /Test Bakery/ }))
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      names: { en: 'Test Bakery' },
      address: expect.objectContaining({ coordinates: [114.1, 22.3] }),
    }),
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
  expect(screen.getAllByRole('button')).toHaveLength(7)
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

it('only drops a pin on explicit request and hides the action once placed', async () => {
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
  await fireEvent.click(screen.getByRole('button', { name: /drop pin/i }))
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
  expect(screen.queryByRole('button', { name: /Fast Place/ })).toBeNull()
})
