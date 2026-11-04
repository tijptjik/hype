// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getAddressDivisionContext } from '#lib/api/division.remote.js'
import AddressBlocks from '#lib/bits/patterns/forms/formFeatureAddress/AddressBlocks.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionContext: vi.fn(async () => ({
    available: true,
    memberships: [],
    options: [],
  })),
}))
afterEach(cleanup)
beforeEach(() => vi.useRealTimers())
it('starts with changed blocks, reveals all seven and can collapse again', async () => {
  const before = emptyFeatureAddress()
  before.overrides.en = {
    buildingName: 'East Wing',
    premisesName: 'Example Court',
    streetName: 'SAMPLE STREET',
  }
  const address = structuredClone(before)
  address.overrides.en.buildingName = 'West Wing'
  const view = render(AddressBlocks, { address, before, locale: 'en' })
  await waitFor(() => expect(view.getByText('East Wing')).toBeTruthy())
  expect(view.getByText('West Wing')).toBeTruthy()
  expect(view.queryByText('Block / Phase / Premises')).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Show all' }))
  expect(view.getAllByText('Example Court')).toHaveLength(2)
  expect(view.getByText('Islands')).toBeTruthy()
  await fireEvent.click(view.getByRole('button', { name: 'Show less' }))
  expect(view.queryByText('Islands')).toBeNull()
})

it('leaves geography to the icon layout without duplicate lookups in detail views', async () => {
  vi.mocked(getAddressDivisionContext).mockClear()
  const address = emptyFeatureAddress()
  address.overrides.en = { streetName: 'SAMPLE STREET' }
  const view = render(AddressBlocks, { address, includeDivisions: false, locale: 'en' })
  expect(view.getByText('Sample Street')).toBeTruthy()
  await fireEvent.click(view.getByRole('button', { name: 'Show all' }))
  expect(view.queryByText('Administration')).toBeNull()
  expect(view.queryByText('Localities')).toBeNull()
  expect(view.queryByText('Islands')).toBeNull()
  expect(getAddressDivisionContext).not.toHaveBeenCalled()
})
