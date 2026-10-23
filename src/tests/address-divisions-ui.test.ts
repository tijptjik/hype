// @vitest-environment jsdom
// SVELTE
import { flushSync } from 'svelte'
// TESTS
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('svelte/transition', () => ({ slide: () => ({ duration: 0 }) }))
import Fixture from './fixtures/components/AddressDivisionsFixture.svelte'
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
})
afterEach(cleanup)
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
      .closest('.flex')
      ?.querySelector('h3')?.textContent,
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
  expect(output(view.container).localityPaths).toEqual([[central.id, child.id]])
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
  const choices = view.getByRole('group', { name: 'Choose a path for Prince Edward' })
  expect(choices.querySelectorAll('button')).toHaveLength(2)
  expect(view.getByRole('button', { name: 'Mong Kok → Prince Edward' })).toBeTruthy()
  expect(view.queryByLabelText('Search other localities at this level')).toBeNull()
  expect(output(view.container).localityPaths).toBeUndefined()
  await fireEvent.click(view.getByRole('button', { name: 'Prince Edward' }))
  expect(output(view.container).localityPaths).toEqual([[princeEdward.id]])
  expect(view.queryByText('Lan Kwai Fong')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Choose neighbourhood' }))
  await fireEvent.input(view.getByLabelText('Search neighbourhoods'), {
    target: { value: 'Prince Edward' },
  })
  await fireEvent.click(
    view.getByRole('button', { name: 'Prince Edward Neighbourhood' }),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Mong Kok → Prince Edward' }))
  expect(output(view.container).localityPaths).toEqual([[mongKok.id, princeEdward.id]])
  expect(view.getAllByRole('list', { name: 'Selected neighbourhood' })).toHaveLength(1)
})

it('clears the whole selection and can return to marker membership', async () => {
  vi.mocked(getAddressDivisionContext).mockReturnValue(
    Promise.resolve(context) as never,
  )
  const view = render(Fixture)
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Clear neighbourhood' })).toBeTruthy(),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Clear neighbourhood' }))
  expect(output(view.container).localityPaths).toEqual([])
  expect(view.queryByText('Central')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Cancel' }))
  await fireEvent.click(view.getByRole('button', { name: 'From marker' }))
  expect(output(view.container).localityPaths).toBeNull()
  expect(view.getByTestId('overrides').textContent).toContain('"mode":"marker"')
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
  expect(output(view.container).localityPaths).toBeUndefined()
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
  expect(view.queryByRole('button', { name: 'Clear neighbourhood' })).toBeNull()
  expect(view.getByRole('region', { name: 'Island' })).toBeTruthy()
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
  expect(
    view.container.querySelector('[data-address-divisions]')?.getAttribute('aria-busy'),
  ).toBe('true')
  resolveNext({ ...context, memberships: [district, central] })
  await waitFor(() => expect(view.queryByText('Fixed island')).toBeNull())
  expect(view.queryByText('Lan Kwai Fong')).toBeNull()
  expect(view.getByText('Fixed district')).toBe(previousDistrict)
  expect(view.getByText('Central')).toBe(locality)
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
