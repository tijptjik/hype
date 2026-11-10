// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Picker from '#lib/bits/patterns/forms/featureLocation/LocationAssociationPicker.svelte'
import { associationGroupDiffers } from '#lib/locations/associationMatch.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
import { emptyFeatureAddress, getAddressLocale } from '#lib/addresses/featureAddress.js'
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionLabel: () => ({ current: null }),
}))
vi.mock('#lib/addresses/nameSuggestions.js', () => ({
  fetchNameSuggestions: async (family: string) =>
    family === 'streets'
      ? [
          {
            id: 'street-correct',
            names: { en: 'Correct Road', 'zh-Hant': '正確道', 'zh-Hans': '正确道' },
            divisionCodes: [],
          },
        ]
      : [
          {
            id: 'building-known',
            names: { en: 'Known Tower', 'zh-Hant': '已知大廈' },
            divisionCodes: [],
          },
        ],
}))
vi.mock('#lib/addresses/nameCatalogue.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/addresses/nameCatalogue.js')>()),
  loadAddressNames: vi.fn(async family =>
    family === 'streets'
      ? [
          {
            id: 'street-correct',
            names: { en: 'Correct Road', 'zh-Hant': '正確道', 'zh-Hans': '正确道' },
            divisionCodes: [],
          },
        ]
      : [
          {
            id: 'building-known',
            names: { en: 'Known Tower', 'zh-Hant': '已知大廈' },
            divisionCodes: [],
          },
        ],
  ),
}))
vi.mock('svelte/motion', () => ({ prefersReducedMotion: { current: true } }))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

const origin = (): Result => ({
  id: 'a',
  kind: 'address',
  names: {},
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3],
    overrides: {
      en: {
        streetName: 'Queen Road',
        premisesName: 'Hollywood Terrace',
        floorExpression: '2/F',
        unitExpression: 'Flat A',
      },
    },
  },
})
const candidate = (kind: Result['kind'] = 'establishment'): Result => ({
  id: 'existing',
  kind,
  names: { en: kind === 'premises' ? 'Hollywood Terrace' : 'Cafe' },
  identity: { locationId: 'l', revisionId: 'r' },
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.1501, 22.3],
    overrides: { en: { streetName: 'Hollywood Road', floorExpression: '3/F' } },
  },
})

it('shows three evidence states, settles a resolving ring, and never changes the selected level', async () => {
  let complete!: (value: { candidates: Result[]; incomplete: boolean }) => void
  const search = vi.fn(input =>
    input.kind === 'premises'
      ? new Promise<{ candidates: Result[]; incomplete: boolean }>(resolve => {
          complete = resolve
        })
      : Promise.resolve({ candidates: [], incomplete: false }),
  )
  render(Picker, { origin: origin(), search, onAccept: vi.fn(), onCancel: vi.fn() })
  expect(screen.getByRole('status').textContent).toContain(
    'Attempting to find more specific locations.',
  )
  const picker = document.querySelector('[data-location-association-picker]')!
  expect(picker.classList.contains('hidden')).toBe(true)
  const premises = screen.getByRole('radio', { name: 'Complex', hidden: true })
  expect(premises.getAttribute('data-evidence')).toBe('address')
  expect(
    screen
      .getByRole('radio', { name: 'Building', hidden: true })
      .getAttribute('data-evidence'),
  ).toBe('none')
  await waitFor(() => expect(search).toHaveBeenCalled())
  complete({
    candidates: [{ ...candidate('premises'), address: origin().address }],
    incomplete: false,
  })
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  expect(picker.classList.contains('hidden')).toBe(false)
  await waitFor(() => expect(premises.getAttribute('data-evidence')).toBe('location'))
  expect(
    screen.getByRole('radio', { name: 'Address' }).getAttribute('aria-checked'),
  ).toBe('true')
})

it('keeps address-only mode quiet and creates no establishment', async () => {
  const search = vi.fn().mockResolvedValue({ candidates: [], incomplete: false })
  const onAccept = vi.fn()
  render(Picker, { origin: origin(), search, onAccept, onCancel: vi.fn() })
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onAccept).toHaveBeenCalledWith(
    expect.objectContaining({
      localKind: 'address',
      address: expect.objectContaining({
        association: expect.objectContaining({ mode: 'manual', lookup: 'not-checked' }),
      }),
    }),
  )
  expect(search.mock.calls.some(([input]) => input.kind === 'establishment')).toBe(true)
})

it('matches while typing without blur, reviews component choices and defaults to the matched pin', async () => {
  const search = vi.fn().mockImplementation(async input => ({
    candidates: input.names.en === 'Cafe' ? [candidate()] : [],
    incomplete: false,
  }))
  const onAccept = vi.fn()
  render(Picker, { origin: origin(), search, onAccept, onCancel: vi.fn() })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  const input = screen.getByRole('textbox', { name: 'Establishment · Name' })
  await fireEvent.input(input, { target: { value: 'Cafe' } })
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  const street = screen.getByRole('switch', {
    name: 'Use chosen address for Street name',
  })
  expect(street.getAttribute('aria-checked')).toBe('false')
  await fireEvent.click(street)
  // Reselecting the current level must retain both the candidate and address choice.
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  expect(street.getAttribute('aria-checked')).toBe('true')
  // Exploring another level and returning restores the selected record and review.
  await fireEvent.click(screen.getByRole('radio', { name: 'Address' }))
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  expect(
    screen
      .getByRole('switch', { name: 'Use chosen address for Street name' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  const result = onAccept.mock.calls[0][0] as Result
  expect(result.identity).toEqual({ locationId: 'l', revisionId: 'r' })
  expect(result.address.coordinates).toEqual(candidate().address.coordinates)
  expect(getAddressLocale(result.address, 'en').streetName).toBe('Queen Road')
  expect(result.address.association?.mode).toBe('unlinked')
})

it('allows a named custom premises after failed lookup and retains its retry state', async () => {
  const search = vi.fn().mockRejectedValue(new Error('offline'))
  const onAccept = vi.fn()
  render(Picker, { origin: origin(), search, onAccept, onCancel: vi.fn() })
  await fireEvent.click(screen.getByRole('radio', { name: 'Complex' }))
  await screen.findByText(/Some sources are unavailable/)
  expect(
    screen.queryByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  ).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Create new complex' }))
  expect(onAccept.mock.calls[0][0]).toMatchObject({
    kind: 'premises',
    localKind: 'premises',
    names: { en: 'Hollywood Terrace' },
    address: { association: { mode: 'unlinked', lookup: 'failed' } },
  })
})

it('discards late matches after the name changes and supports keyboard notch selection', async () => {
  let complete!: (value: { candidates: Result[]; incomplete: boolean }) => void
  const search = vi.fn(
    () =>
      new Promise<{ candidates: Result[]; incomplete: boolean }>(resolve => {
        complete = resolve
      }),
  )
  render(Picker, { origin: origin(), search, onAccept: vi.fn(), onCancel: vi.fn() })
  await fireEvent.keyDown(screen.getByRole('radio', { name: 'Address' }), {
    key: 'ArrowLeft',
  })
  const input = screen.getByRole('textbox', { name: 'Complex · Name' })
  await fireEvent.input(input, { target: { value: 'Other premises' } })
  complete({ candidates: [candidate('premises')], incomplete: false })
  expect(screen.queryByRole('button', { name: /Hollywood Terrace/ })).toBeNull()
  expect(
    screen.getByRole('radio', { name: 'Complex' }).getAttribute('aria-checked'),
  ).toBe('true')
})

it('allows a correction when both sources are wrong without losing the selected identity', async () => {
  const onAccept = vi.fn()
  const search = vi
    .fn()
    .mockResolvedValue({ candidates: [candidate()], incomplete: false })
  render(Picker, { origin: origin(), search, onAccept, onCancel: vi.fn() })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  expect(
    screen.queryByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  ).toBeNull()
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Street name' }))
  const correction = screen.getByRole('combobox', { name: 'Your Street name' })
  expect(
    correction.closest('[data-address-choice]')?.getAttribute('data-address-choice'),
  ).toBe('location')
  expect(document.activeElement).toBe(correction)
  await fireEvent.input(correction, { target: { value: 'Correct Road' } })
  expect(
    screen
      .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
      .hasAttribute('disabled'),
  ).toBe(true)
  await fireEvent.click(await screen.findByRole('option', { name: 'Correct Road' }))
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  const result = onAccept.mock.calls[0][0] as Result
  expect(result.identity).toEqual(candidate().identity)
  expect(getAddressLocale(result.address, 'en').streetName).toBe('Correct Road')
  expect(result.address.association?.choices?.street).toBe('custom')
  expect(result.address.association?.content?.streetId).toBe('street-correct')
  expect(getAddressLocale(result.address, 'zhHant').streetName).toBe('正確道')
})

it.each(['location', 'original'] as const)(
  'accepts the explicitly chosen %s marker without changing address choices',
  async side => {
    const onAccept = vi.fn()
    render(Picker, {
      origin: origin(),
      search: vi
        .fn()
        .mockResolvedValue({ candidates: [candidate()], incomplete: false }),
      onAccept,
      onCancel: vi.fn(),
      markerNumberFor: row => (row.id === 'a' ? 2 : 0),
    })
    await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
    await fireEvent.click(
      await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
    )
    const markerSwitch = screen.getByRole('switch', {
      name: 'Use chosen address for Map pin',
    })
    expect(markerSwitch.getAttribute('aria-checked')).toBe('false')
    expect(
      screen
        .getByRole('button', { name: /Establishment Position$/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    if (side === 'original')
      await fireEvent.click(screen.getByRole('button', { name: /Address Position$/ }))
    await fireEvent.click(
      screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
    )
    const result = onAccept.mock.calls[0][0] as Result
    expect(result.address.coordinates).toEqual(
      (side === 'location' ? candidate() : origin()).address.coordinates,
    )
    expect(getAddressLocale(result.address, 'en').streetName).toBe('Hollywood Road')
  },
)

it('recentres the preview on each pin switch and direct position selection without accepting', async () => {
  const onPreview = vi.fn()
  const onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onPreview,
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  onPreview.mockClear()
  const toggle = screen.getByRole('switch', { name: 'Use chosen address for Map pin' })
  await fireEvent.click(toggle)
  expect(onPreview.mock.lastCall?.[0].address.coordinates).toEqual(
    origin().address.coordinates,
  )
  await fireEvent.click(toggle)
  expect(onPreview.mock.lastCall?.[0].address.coordinates).toEqual(
    candidate().address.coordinates,
  )
  await fireEvent.click(screen.getByRole('button', { name: /Address Position$/ }))
  expect(onPreview.mock.lastCall?.[0].address.coordinates).toEqual(
    origin().address.coordinates,
  )
  await fireEvent.click(screen.getByRole('button', { name: /Establishment Position$/ }))
  expect(onPreview.mock.lastCall?.[0].address.coordinates).toEqual(
    candidate().address.coordinates,
  )
  expect(onPreview).toHaveBeenCalledTimes(4)
  expect(onPreview.mock.calls.every(([, preserveZoom]) => preserveZoom === true)).toBe(
    true,
  )
  expect(onAccept).not.toHaveBeenCalled()
})

it.each(['original', 'location'] as const)(
  'edits the %s pin as a custom location without mutating source evidence',
  async side => {
    const initial = origin()
    const source = candidate()
    const onAccept = vi.fn()
    const onPreview = vi.fn()
    const onMapCandidates = vi.fn()
    render(Picker, {
      origin: initial,
      search: vi.fn().mockResolvedValue({ candidates: [source], incomplete: false }),
      onAccept,
      onPreview,
      onMapCandidates,
      onCancel: vi.fn(),
    })
    await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
    await fireEvent.click(
      await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
    )
    if (side === 'original')
      await fireEvent.click(screen.getByRole('button', { name: /Address Position$/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    expect(onPreview.mock.lastCall?.[1]).toBe(true)
    const markers = onMapCandidates.mock
      .lastCall?.[0] as import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
    const editable = markers.filter(row => row.onReposition)
    expect(editable.map(row => row.id)).toEqual([
      side === 'original' ? initial.id : source.id,
    ])
    editable[0].onReposition?.([114.16, 22.31])
    await screen.findByRole('button', { name: /Custom position$/ })
    await fireEvent.click(screen.getByRole('button', { name: /^Reset .* Position$/ }))
    expect(onPreview.mock.lastCall?.[0].address.coordinates).toEqual(
      side === 'original' ? initial.address.coordinates : source.address.coordinates,
    )
    expect(screen.queryByRole('button', { name: /Custom position$/ })).toBeNull()
    expect(onAccept).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    const restoredMarkers = onMapCandidates.mock
      .lastCall?.[0] as import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
    restoredMarkers.find(row => row.onReposition)?.onReposition?.([114.16, 22.31])
    await screen.findByRole('button', { name: /Custom position$/ })
    await fireEvent.click(screen.getByRole('button', { name: 'Done', exact: true }))
    expect(
      onMapCandidates.mock.lastCall?.[0].some(
        (row: { onReposition?: unknown }) => row.onReposition,
      ),
    ).toBe(false)
    await fireEvent.click(
      screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
    )
    const result = onAccept.mock.lastCall?.[0] as Result
    expect(result.address.coordinates).toEqual([114.16, 22.31])
    expect(result.address.association?.mode).toBe('unlinked')
    expect(result.address.association?.targetId).toBeUndefined()
    expect(result.identity).toBeUndefined()
    expect(result.source).toBeUndefined()
    expect(result.buildingSource).toBeUndefined()
    expect(initial.address.coordinates).toEqual(origin().address.coordinates)
    expect(source.address.coordinates).toEqual(candidate().address.coordinates)
  },
)

it.each(['address', 'building'] as const)(
  'accepts the initial %s selection with persistence intent and without candidate edits',
  async kind => {
    const initial = { ...origin(), kind }
    const onAccept = vi.fn()
    const onMapCandidates = vi.fn()
    render(Picker, {
      origin: initial,
      search: vi
        .fn()
        .mockResolvedValue({ candidates: [candidate()], incomplete: false }),
      onAccept,
      onMapCandidates,
      onCancel: vi.fn(),
    })
    await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
    await fireEvent.click(
      await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
    )
    await screen.findByRole('button', { name: 'Use Recommended Location' })
    await fireEvent.click(
      screen.getByRole('button', {
        name: kind === 'building' ? /Building Position$/ : /Address Position$/,
      }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    const markers = onMapCandidates.mock
      .lastCall?.[0] as import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
    markers.find(row => row.onReposition)?.onReposition?.([114.16, 22.31])
    await screen.findByRole('button', { name: /Custom position$/ })
    await fireEvent.click(screen.getByRole('button', { name: 'Use Initial Selection' }))
    expect(onAccept).toHaveBeenCalledExactlyOnceWith({
      ...initial,
      localKind: initial.localKind ?? (initial.source ? undefined : initial.kind),
      associationConfirmed: true,
    })
  },
)

it('reveals cached alternatives in the click update without a search or preview flight', async () => {
  const search = vi
    .fn()
    .mockResolvedValue({ candidates: [candidate()], incomplete: false })
  const onAccept = vi.fn()
  const onPreview = vi.fn()
  render(Picker, { origin: origin(), search, onAccept, onPreview, onCancel: vi.fn() })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  const alternative = await screen.findByRole('button', {
    name: /Cafe.*Hollywood Road/,
  })
  await fireEvent.click(alternative)
  const calls = search.mock.calls.length
  const replace = screen.getByRole('button', { name: 'Change selection' })
  onPreview.mockClear()
  await fireEvent.click(replace)
  expect(screen.getByRole('button', { name: /Cafe.*Hollywood Road/ })).toBe(alternative)
  expect(onPreview).not.toHaveBeenCalled()
  expect(search).toHaveBeenCalledTimes(calls)
  expect(onAccept).not.toHaveBeenCalled()
  expect(screen.queryByText('Loading alternatives…')).toBeNull()
})

it('switches an inline correction back to source evidence and resets marker choice on reselection', async () => {
  const onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Street name' }))
  await fireEvent.input(screen.getByRole('combobox', { name: 'Your Street name' }), {
    target: { value: 'Correct Road' },
  })
  await fireEvent.click(
    screen.getByRole('switch', { name: 'Use chosen address for Street name' }),
  )
  expect(screen.queryByRole('combobox', { name: 'Your Street name' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: /Establishment Position$/ }))
  await fireEvent.click(screen.getByRole('button', { name: 'Change selection' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  expect(
    screen
      .getByRole('switch', { name: 'Use chosen address for Map pin' })
      .getAttribute('aria-checked'),
  ).toBe('false')
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  const result = onAccept.mock.calls[0][0] as Result
  expect(result.address.coordinates).toEqual(candidate().address.coordinates)
  expect(getAddressLocale(result.address, 'en').streetName).toBe('Hollywood Road')
})

it('shows a proposal with metadata and name editing but no address editing', async () => {
  const selected = { ...candidate(), address: origin().address }
  const view = render(Picker, {
    origin: selected,
    search: vi.fn().mockResolvedValue({ candidates: [], incomplete: false }),
    onAccept: vi.fn(),
    onCancel: vi.fn(),
  })
  await screen.findByText('Proposed location')
  const proposal = view.container.querySelector('[data-association-proposal]')!
  expect(proposal.textContent).toContain('Open to Sync')
  expect(proposal.textContent).toContain('Queen Road')
  expect(screen.getByRole('button', { name: 'Use' })).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Change selection' }).textContent,
  ).toContain('Change')
  expect(screen.queryByRole('button', { name: 'Edit Details' })).toBeNull()
  expect(screen.queryByRole('switch')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Establishment name' }))
  expect(screen.getByRole('textbox', { name: 'Establishment name' }).tagName).toBe(
    'TEXTAREA',
  )
  expect(screen.queryByRole('button', { name: 'Reset Establishment name' })).toBeNull()
  await fireEvent.input(screen.getByRole('textbox', { name: 'Establishment name' }), {
    target: { value: 'Renamed Cafe' },
  })
  expect(screen.getByRole('button', { name: 'Reset Establishment name' })).toBeTruthy()
  await fireEvent.input(screen.getByRole('textbox', { name: 'Establishment name' }), {
    target: { value: 'Cafe' },
  })
  expect(screen.queryByRole('button', { name: 'Reset Establishment name' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Multilingual' })).toBeTruthy()
})

it('rings a published Address record, hides metadata and keeps explicit creation below results', async () => {
  const address = origin()
  address.address.source.address2dId = 'published-address'
  const view = render(Picker, {
    origin: address,
    search: vi
      .fn()
      .mockResolvedValue({ candidates: [candidate('premises')], incomplete: false }),
    onAccept: vi.fn(),
    onCancel: vi.fn(),
  })
  expect(
    screen.getByRole('radio', { name: 'Address' }).getAttribute('data-evidence'),
  ).toBe('location')
  expect(view.container.querySelector('[data-association-status]')).toBeNull()
  await fireEvent.click(screen.getByRole('radio', { name: 'Complex' }))
  await screen.findByRole('button', { name: /Hollywood Terrace.*Hollywood Road/ })
  expect(
    view.container.querySelector('[data-association-ghost]')?.textContent,
  ).toContain('Create new complex')
  expect(
    view.container.querySelector('[data-association-footer] [data-association-ghost]'),
  ).toBeTruthy()
  expect(screen.queryByText('Possible matching locations')).toBeNull()
})

it('publishes numbered nearby markers, highlights hover and focus, and reviews map selections without accepting', async () => {
  const onMapCandidates = vi.fn(),
    onAccept = vi.fn()
  const first = candidate('building'),
    second = {
      ...candidate('building'),
      id: 'second',
      names: { en: 'Other tower' },
      identity: { locationId: 'other', revisionId: 'r2' },
    }
  const view = render(Picker, {
    origin: origin(),
    search: vi
      .fn()
      .mockResolvedValue({ candidates: [first, second], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
    onMapCandidates,
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Building' }))
  const row = await screen.findByRole('button', { name: /Other tower.*Hollywood Road/ })
  expect(
    view.container.querySelectorAll('[data-association-number]')[1].textContent,
  ).toBe('2')
  expect(onMapCandidates.mock.lastCall?.[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'existing', number: 1 }),
      expect.objectContaining({ id: 'second', number: 2 }),
      expect.objectContaining({ id: 'a', number: 0 }),
    ]),
  )
  await fireEvent.mouseEnter(row)
  expect(
    onMapCandidates.mock.lastCall?.[0].find(
      (marker: { id: string }) => marker.id === 'second',
    ).highlighted,
  ).toBe(true)
  await fireEvent.mouseLeave(row)
  expect(
    onMapCandidates.mock.lastCall?.[0].find(
      (marker: { id: string }) => marker.id === 'second',
    ).highlighted,
  ).toBe(false)
  await fireEvent.focus(row)
  expect(
    onMapCandidates.mock.lastCall?.[0].find(
      (marker: { id: string }) => marker.id === 'second',
    ).highlighted,
  ).toBe(true)
  onMapCandidates.mock.lastCall?.[1]('second')
  await screen.findByRole('button', { name: 'Use Recommended Location' })
  expect(onAccept).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: /Building Position$/ }).textContent,
  ).toContain('2')
})

it('keeps a provisional record immutable while searching and resets to its preselected identity', async () => {
  const local: Result = {
    ...candidate(),
    id: 'local:mine',
    localKind: 'establishment',
    names: { en: 'My Courtyard' },
    address: {
      ...origin().address,
      association: {
        originKind: 'address',
        kind: 'establishment',
        mode: 'unlinked',
        lookup: 'no-match',
        names: { en: 'My Courtyard' },
      },
    },
  }
  const onAccept = vi.fn()
  const view = render(Picker, {
    origin: local,
    search: vi.fn().mockResolvedValue({
      candidates: [
        local,
        { ...candidate(), identity: { locationId: 'alternative', revisionId: 'r2' } },
      ],
      incomplete: false,
    }),
    onAccept,
    onCancel: vi.fn(),
  })
  await screen.findByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
  expect(
    view.container.querySelector('[data-association-ghost]')?.textContent,
  ).toContain('My Courtyard')
  await waitFor(() =>
    expect(view.container.querySelectorAll('[data-association-result]')).toHaveLength(
      1,
    ),
  )
  expect(screen.queryByText('No confirmed match yet')).toBeNull()
  await fireEvent.input(screen.getByRole('textbox', { name: 'Establishment · Name' }), {
    target: { value: 'Cafe' },
  })
  expect(
    view.container.querySelector('[data-association-ghost]')?.textContent,
  ).not.toContain('My Courtyard')
  expect(
    screen.queryByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  ).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Reset search' }))
  expect(
    (screen.getByRole('textbox', { name: 'Establishment · Name' }) as HTMLInputElement)
      .value,
  ).toBe('My Courtyard')
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onAccept.mock.lastCall?.[0]).toMatchObject({
    names: { en: 'My Courtyard' },
    identity: local.identity,
    address: { association: { mode: 'unlinked' } },
  })
})

it('latches results and settled empty state while a new lookup is pending', async () => {
  const pending: ((value: { candidates: Result[]; incomplete: boolean }) => void)[] = []
  const search = vi.fn(input =>
    input.kind === 'establishment'
      ? new Promise<{ candidates: Result[]; incomplete: boolean }>(resolve =>
          pending.push(resolve),
        )
      : Promise.resolve({ candidates: [], incomplete: false }),
  )
  const view = render(Picker, {
    origin: origin(),
    search,
    onAccept: vi.fn(),
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  pending.shift()!({ candidates: [candidate()], incomplete: false })
  await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ })
  const input = screen.getByRole('textbox', { name: 'Establishment · Name' })
  await fireEvent.input(input, { target: { value: 'Missing' } })
  expect(screen.getByRole('button', { name: /Cafe.*Hollywood Road/ })).toBeTruthy()
  expect(view.container.querySelector('[data-association-empty]')).toBeNull()
  await waitFor(() => expect(pending.length).toBe(1))
  pending.shift()!({ candidates: [], incomplete: false })
  await screen.findByText('No confirmed match yet')
  expect(
    view.container
      .querySelector('[data-association-empty]')
      ?.contains(screen.getByText('No confirmed match yet')),
  ).toBe(true)
  await fireEvent.input(input, { target: { value: 'Cafe' } })
  expect(screen.getByRole('button', { name: /Cafe.*Hollywood Road/ })).toBeTruthy()
  await fireEvent.input(input, { target: { value: 'Still missing' } })
  await waitFor(() => expect(pending.length).toBe(1))
  pending.shift()!({ candidates: [], incomplete: false })
  await screen.findByText('No confirmed match yet')
  await fireEvent.input(input, { target: { value: 'Another query' } })
  expect(screen.getByText('No confirmed match yet')).toBeTruthy()
})

it('distinguishes manual, unlinked and upstream-backed result records', async () => {
  const view = render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({
      candidates: ['manual', 'unlinked', 'linked'].map((mode, i) => ({
        ...candidate(),
        id: `record-${i}`,
        names: { en: `Record ${i}` },
        recordMode: mode,
      })),
      incomplete: false,
    }),
    onAccept: vi.fn(),
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await screen.findByText('Not Synced')
  expect(screen.getByText('Open to Sync')).toBeTruthy()
  expect(screen.getByText('Synced')).toBeTruthy()
  expect(
    [...view.container.querySelectorAll('[data-record-mode]')].map(row =>
      row.getAttribute('data-record-mode'),
    ),
  ).toEqual(['manual', 'unlinked', 'linked'])
})

it('highlights the hovered comparison marker and requests a fit of exactly the two reviewed pins', async () => {
  const onMapCandidates = vi.fn(),
    onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({
      candidates: [candidate(), { ...candidate(), id: 'unrelated' }],
      incomplete: false,
    }),
    onAccept,
    onCancel: vi.fn(),
    onMapCandidates,
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    (await screen.findAllByRole('button', { name: /Cafe.*Hollywood Road/ }))[0],
  )
  await fireEvent.mouseEnter(screen.getByRole('button', { name: /Address Position$/ }))
  const markers = onMapCandidates.mock.lastCall![0]
  expect(markers.map((row: { id: string }) => row.id)).toEqual(['a', 'existing'])
  expect(
    markers.every(
      (row: { fitGroup: string }) => row.fitGroup === 'association:a:existing',
    ),
  ).toBe(true)
  expect(
    markers
      .filter((row: { highlighted: boolean }) => row.highlighted)
      .map((row: { id: string }) => row.id),
  ).toEqual(['a'])
  expect(onAccept).not.toHaveBeenCalled()
  await fireEvent.focus(screen.getByRole('button', { name: /Establishment Position$/ }))
  expect(
    onMapCandidates.mock.lastCall![0].find(
      (row: { id: string }) => row.id === 'existing',
    ).highlighted,
  ).toBe(true)
})

it('edits establishment and building names in attached language fields and resets to selected evidence', async () => {
  const onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({
      candidates: [{ ...candidate(), names: { ...candidate().names, fr: 'Café' } }],
      incomplete: false,
    }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  expect(
    screen
      .getByRole('button', { name: 'Expand location types' })
      .getAttribute('aria-expanded'),
  ).toBe('false')
  expect(screen.queryByRole('button', { name: 'Multilingual' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Establishment name' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Establishment name' }), {
    target: { value: 'My Cafe' },
  })
  await fireEvent.click(
    screen.getByRole('button', { name: 'Establishment name · zh-hant' }),
  )
  await fireEvent.input(
    screen.getByRole('textbox', { name: 'Establishment name · zh-hant' }),
    { target: { value: '我的咖啡店' } },
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Building' }))
  await fireEvent.input(screen.getByRole('combobox', { name: 'Your Building' }), {
    target: { value: 'Custom Tower' },
  })
  expect(screen.getAllByLabelText('Override').length).toBeGreaterThanOrEqual(3)
  await fireEvent.click(screen.getByRole('button', { name: 'Reset Building' }))
  expect(screen.getByRole('button', { name: 'Edit Building' })).toBeTruthy()
  expect(screen.queryByRole('combobox', { name: 'Your Building' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Building' }))
  await fireEvent.input(screen.getByRole('combobox', { name: 'Your Building' }), {
    target: { value: 'Known' },
  })
  await fireEvent.click(await screen.findByRole('option', { name: 'Known Tower' }))
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  const result = onAccept.mock.lastCall![0] as Result
  expect(result.names).toMatchObject({
    en: 'My Cafe',
    'zh-hant': '我的咖啡店',
    fr: 'Café',
  })
  expect(result.address.association?.names).toEqual(result.names)
  expect(result.identity).toEqual(candidate().identity)
  expect(getAddressLocale(result.address, 'en').buildingName).toBe('Known Tower')
  expect(getAddressLocale(result.address, 'zhHant').buildingName).toBe('已知大廈')
})

it('keeps custom buildings but rejects unselected street text until the correction is reset', async () => {
  const onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Street name' }))
  await fireEvent.input(screen.getByRole('combobox', { name: 'Your Street name' }), {
    target: { value: 'Invented Street' },
  })
  expect(
    screen
      .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
      .hasAttribute('disabled'),
  ).toBe(true)
  await fireEvent.click(screen.getByRole('button', { name: 'Reset Street name' }))
  expect(
    screen
      .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
      .hasAttribute('disabled'),
  ).toBe(false)
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Building' }))
  await fireEvent.input(screen.getByRole('combobox', { name: 'Your Building' }), {
    target: { value: 'Custom Tower' },
  })
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  const result = onAccept.mock.lastCall![0] as Result
  expect(getAddressLocale(result.address, 'en').buildingName).toBe('Custom Tower')
  expect(getAddressLocale(result.address, 'en').streetName).toBe('Hollywood Road')
})

it('does not carry name overrides into a different provisional identity', async () => {
  const local: Result = {
    ...candidate(),
    id: 'local:mine',
    identity: { locationId: 'my-location', revisionId: 'r' },
    localKind: 'establishment',
    names: { en: 'My Courtyard' },
    address: {
      ...origin().address,
      association: {
        originKind: 'address',
        kind: 'establishment',
        mode: 'unlinked',
        lookup: 'no-match',
        names: { en: 'My Courtyard' },
      },
    },
  }
  const onAccept = vi.fn()
  render(Picker, {
    origin: local,
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Establishment name' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Establishment name' }), {
    target: { value: 'Wrong for courtyard' },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Change selection' }))
  await screen.findByRole('textbox', { name: 'Establishment · Name' })
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onAccept.mock.lastCall![0].names).toEqual({ en: 'My Courtyard' })
})

it('returns corrections to clickable text on blur and does not translate shared identifiers', async () => {
  const onAccept = vi.fn()
  const view = render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  for (const group of ['number', 'floor', 'unit'])
    expect(
      view.container.querySelectorAll(
        `[data-address-group="${group}"] [data-field-locale]`,
      ),
    ).toHaveLength(2)
  expect(
    view.container.querySelector(
      '[data-address-group="street"] [data-field-locale="en"]',
    )?.textContent,
  ).not.toContain('EN')
  expect(
    screen.queryByRole('textbox', { name: 'Establishment name · zh-hant' }),
  ).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Your Building' }))
  const input = screen.getByRole('combobox', { name: 'Your Building' })
  await fireEvent.input(input, { target: { value: 'My Tower' } })
  await fireEvent.focusOut(input, {
    relatedTarget: screen.getByRole('button', {
      name: /^Use (?:Recommended Location|Location)$/,
    }),
  })
  expect(screen.queryByRole('combobox', { name: 'Your Building' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Your Building' }).textContent).toContain(
    'My Tower',
  )
  expect(
    screen
      .getByRole('button', { name: 'Your Building' })
      .querySelector('[aria-label="Override"]'),
  ).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Your Building' }))
  expect(
    (screen.getByRole('combobox', { name: 'Your Building' }) as HTMLInputElement).value,
  ).toBe('My Tower')
  await fireEvent.click(screen.getByRole('button', { name: 'Reset Building' }))
  expect(
    screen
      .getByRole('button', { name: 'Your Building' })
      .querySelector('[aria-label="Override"]'),
  ).toBeNull()
})

it('accepts structured level and flat references with shared semantic types', async () => {
  const onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Level' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Your Level' }), {
    target: { value: 'Basement 2' },
  })
  expect(screen.getByRole('combobox', { name: 'Floor type' }).textContent).toContain(
    'Basement',
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Flat / Unit' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Your Flat / Unit' }), {
    target: { value: 'Room 45' },
  })
  expect(screen.getByRole('combobox', { name: 'Unit type' }).textContent).toContain(
    'Room',
  )
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  const result = onAccept.mock.lastCall![0] as Result
  expect(localAddressContent(result.address).unit).toMatchObject({
    floorType: 'B',
    floorRef: '2',
    unitType: 'R',
    unitRef: '45',
  })
  expect(result.address.association?.choices).toMatchObject({
    floor: 'custom',
    unit: 'custom',
  })
})

it('accepts the proposal without comparing it to itself or changing its address', async () => {
  const selected = candidate('building'),
    onAccept = vi.fn()
  const view = render(Picker, {
    origin: selected,
    search: vi.fn().mockResolvedValue({ candidates: [], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await screen.findByText('Proposed location')
  expect(view.container.querySelector('[data-association-details]')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Edit Details' })).toBeNull()
  expect(screen.queryByRole('switch')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Use' }))
  expect(onAccept.mock.lastCall?.[0].identity).toEqual(selected.identity)
  expect(getAddressLocale(onAccept.mock.lastCall?.[0].address, 'en')).toMatchObject(
    getAddressLocale(selected.address, 'en'),
  )
})

it('shows establishment strength alongside an exact Building recommendation and preserves explicit acceptance', async () => {
  const address = {
    ...origin().address,
    overrides: {
      en: {
        buildingName: 'Fu Yee Court',
        streetName: 'Ferry Street',
        buildingNumberExpression: '11-16',
      },
    },
  }
  const building: Result = {
    id: 'building:fu-yee',
    kind: 'building',
    names: { en: 'Fu Yee Court' },
    buildingSource: { id: 'fu-yee', release: 'r', addressId: '11-16' },
    address,
  }
  const onAccept = vi.fn()
  render(Picker, {
    origin: { ...origin(), names: { en: 'Fu Yee Court' }, address },
    search: vi.fn(async input => ({
      candidates:
        input.kind === 'building'
          ? [building]
          : input.kind === 'establishment'
            ? [
                {
                  ...candidate(),
                  names: { en: 'Fu Yee Court' },
                  address: {
                    ...emptyFeatureAddress(),
                    coordinates: address.coordinates,
                  },
                },
              ]
            : [],
      incomplete: false,
    })),
    onAccept,
    onCancel: vi.fn(),
  })
  await screen.findByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
  await waitFor(() =>
    expect(
      screen.getByRole('radio', { name: 'Building' }).getAttribute('aria-checked'),
    ).toBe('true'),
  )
  expect(screen.queryAllByRole('switch')).toHaveLength(0)
  expect(
    screen
      .getByRole('radio', { name: 'Establishment' })
      .querySelector('[data-match-strength]')
      ?.getAttribute('data-match-strength'),
  ).toBe('80')
  expect(onAccept).not.toHaveBeenCalled()
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onAccept.mock.lastCall?.[0].buildingSource).toEqual(building.buildingSource)
})

it('keeps the selected Location available after reselect and retains inherited naming', async () => {
  const chosen: Result = {
    ...candidate('building'),
    nameMode: 'inherit',
    buildingSource: { id: 'same', release: 'r' },
  }
  const onAccept = vi.fn()
  render(Picker, {
    origin: chosen,
    search: vi.fn().mockResolvedValue({ candidates: [], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Change selection' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Use' }))
  expect(onAccept.mock.lastCall?.[0].nameMode).toBe('inherit')
})

it('hides empty source metadata differences and collapses unused parts without losing new values', async () => {
  const source = origin()
  source.address.overrides.en = {
    ...source.address.overrides.en,
    blockType: 'block',
    blockTypeBeforeNumber: true,
  }
  expect(associationGroupDiffers(source.address, candidate().address, 'block')).toBe(
    false,
  )
  const onAccept = vi.fn()
  const view = render(Picker, {
    origin: source,
    search: vi.fn().mockResolvedValue({ candidates: [candidate()], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Establishment' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  expect(view.container.querySelector('[data-address-group="block"]')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }))
  expect(view.container.querySelectorAll('[data-address-group="block"]')).toHaveLength(
    2,
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Access hints' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Your Access hints' }), {
    target: { value: 'Side entrance' },
  })
  await fireEvent.click(
    screen.getByRole('button', { name: 'Hide additional address details' }),
  )
  expect(view.container.querySelector('[data-address-group="block"]')).toBeNull()
  expect(screen.getByText('Side entrance')).toBeTruthy()
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(getAddressLocale(onAccept.mock.lastCall![0].address, 'en').accessHint).toBe(
    'Side entrance',
  )
})

it.each([false, true])(
  'does not infer an exact identity when coverage is incomplete or ambiguous (%s)',
  async incomplete => {
    const address = {
      ...origin().address,
      overrides: {
        en: {
          buildingName: 'Fu Yee Court',
          streetName: 'Ferry Street',
          buildingNumberExpression: '11-16',
        },
      },
    }
    const building: Result = {
      id: 'building:fu-yee',
      kind: 'building',
      names: { en: 'Fu Yee Court' },
      buildingSource: { id: 'fu-yee', release: 'r' },
      address,
    }
    const search = vi.fn(async input => ({
      candidates:
        input.kind === 'building'
          ? incomplete
            ? [building]
            : [
                building,
                {
                  ...building,
                  id: 'different-building',
                  buildingSource: { id: 'different-building', release: 'r' },
                },
              ]
          : [],
      incomplete,
    }))
    render(Picker, {
      origin: { ...origin(), address },
      search,
      onAccept: vi.fn(),
      onCancel: vi.fn(),
    })
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Building' }).getAttribute('aria-busy'),
      ).toBe('false'),
    )
    expect(
      screen.queryByText('Matching name and address · suggested Location'),
    ).toBeNull()
    expect(
      screen.getByRole('radio', { name: 'Address' }).getAttribute('aria-checked'),
    ).toBe('true')
  },
)

it('does not promote a weak manually selected candidate to strong evidence and only highlights markers on interaction', async () => {
  const onMapCandidates = vi.fn()
  const building = candidate('building')
  render(Picker, {
    origin: origin(),
    search: vi.fn(async input => ({
      candidates: input.kind === 'building' ? [building] : [],
      incomplete: false,
    })),
    onAccept: vi.fn(),
    onCancel: vi.fn(),
    onMapCandidates,
  })
  await fireEvent.click(screen.getByRole('radio', { name: 'Building' }))
  await fireEvent.click(
    await screen.findByRole('button', { name: /Cafe.*Hollywood Road/ }),
  )
  expect(
    onMapCandidates.mock.lastCall![0].some(
      (marker: { highlighted: boolean }) => marker.highlighted,
    ),
  ).toBe(false)
  await fireEvent.click(screen.getByRole('radio', { name: 'Complex' }))
  expect(
    screen.getByRole('radio', { name: 'Building' }).getAttribute('data-evidence'),
  ).toBe('none')
})

it('shows both identities, a partial attention gauge and original fallback for a missing building', async () => {
  const building: Result = {
    id: 'theatre-building',
    kind: 'building',
    names: { en: 'Disney’s Storybook Theater' },
    buildingSource: { id: 'theatre', release: 'fixture' },
    address: {
      ...emptyFeatureAddress(),
      coordinates: [114.15, 22.3],
      overrides: { en: { buildingName: 'Disney’s Storybook Theater' } },
    },
  }
  const theatre: Result = {
    id: 'theatre-place',
    kind: 'establishment',
    names: { en: 'Storybook Theater' },
    source: { ssId: 'theatre-place', resourceReleaseId: 'fixture' },
    address: { ...emptyFeatureAddress(), coordinates: [114.15014, 22.3] },
  }
  const onAccept = vi.fn()
  const view = render(Picker, {
    origin: building,
    search: vi.fn(async input => ({
      candidates: input.kind === 'establishment' ? [theatre] : [],
      incomplete: false,
    })),
    onAccept,
    onCancel: vi.fn(),
  })
  const establishment = screen.getByRole('radio', { name: 'Establishment' })
  await waitFor(() =>
    expect(
      establishment
        .querySelector('[data-match-strength]')
        ?.getAttribute('data-match-strength'),
    ).toBe('70'),
  )
  expect(
    screen.getByRole('radio', { name: 'Building' }).getAttribute('aria-checked'),
  ).toBe('true')
  await fireEvent.click(establishment)
  await fireEvent.click(
    await screen.findByRole('button', { name: /Storybook Theater/ }),
  )
  const headers = view.container.querySelector('[data-association-record-headers]')!
  expect(headers.textContent).toContain('Disney’s Storybook Theater')
  expect(headers.textContent).toContain('Storybook Theater')
  expect(
    screen
      .getByRole('switch', { name: 'Use chosen address for Building' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onAccept.mock.lastCall?.[0].source).toEqual(theatre.source)
  expect(getAddressLocale(onAccept.mock.lastCall?.[0].address, 'en').buildingName).toBe(
    'Disney’s Storybook Theater',
  )
})

it('automatically uses an explicitly selected most-specific identity after complete discovery', async () => {
  const onAccept = vi.fn()
  const building = candidate('building')
  render(Picker, {
    origin: building,
    autoAcceptSpecific: true,
    search: vi.fn().mockResolvedValue({ candidates: [], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  expect(
    await screen.findByText('Already the most specific match. Using this location…'),
  ).toBeTruthy()
  await waitFor(() => expect(onAccept).toHaveBeenCalledOnce())
  expect(onAccept.mock.calls[0][0]).toMatchObject({
    kind: 'building',
    identity: building.identity,
    associationConfirmed: true,
  })
})

it('keeps confirmation when discovery is incomplete even for the selected identity', async () => {
  const onAccept = vi.fn()
  render(Picker, {
    origin: candidate('building'),
    autoAcceptSpecific: true,
    search: vi.fn().mockResolvedValue({ candidates: [], incomplete: true }),
    onAccept,
    onCancel: vi.fn(),
  })
  expect(
    await screen.findByRole('button', { name: /^Use(?: Location)?$/ }),
  ).toBeTruthy()
  expect(
    screen.queryByText('Already the most specific match. Using this location…'),
  ).toBeNull()
  expect(onAccept).not.toHaveBeenCalled()
})

it('keeps review when the input names a more-specific building than the selected complex', async () => {
  const onAccept = vi.fn()
  const complex = candidate('premises')
  complex.address.overrides.en = {
    buildingName: 'Known Tower',
    streetName: 'Hollywood Road',
  }
  render(Picker, {
    origin: complex,
    autoAcceptSpecific: true,
    search: vi.fn().mockResolvedValue({ candidates: [], incomplete: false }),
    onAccept,
    onCancel: vi.fn(),
  })
  expect(
    await screen.findByRole('button', { name: /^Use(?: Location)?$/ }),
  ).toBeTruthy()
  expect(onAccept).not.toHaveBeenCalled()
})

it('deliberately selects an existing building part without converting address floor text into an identity', async () => {
  const selected = { ...candidate('building_part'), names: { en: 'East Wing' } }
  const onAccept = vi.fn()
  render(Picker, {
    origin: origin(),
    search: vi.fn(async input => ({
      candidates: input.kind === 'building_part' ? [selected] : [],
      incomplete: false,
    })),
    onAccept,
    onCancel: vi.fn(),
  })
  expect(
    screen
      .getByRole('radio', { name: 'Address', hidden: true })
      .getAttribute('aria-checked'),
  ).toBe('true')
  await fireEvent.click(
    await screen.findByRole('radio', { name: 'Inside or part of the building' }),
  )
  await fireEvent.click(
    await screen.findByRole('button', { name: /East Wing.*Hollywood Road/ }),
  )
  await fireEvent.click(
    screen.getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ }),
  )
  expect(onAccept).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'building_part', identity: selected.identity }),
  )
})
