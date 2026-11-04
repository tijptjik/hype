// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/FeatureAddress3dFixture.svelte'
vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionContext: () =>
    Promise.resolve({ memberships: [], options: [], available: false }),
}))
vi.mock('#lib/addresses/nameCatalogue.js', async original => ({
  ...(await original<object>()),
  loadAddressNames: async () => [],
}))
beforeEach(() => {
  vi.useRealTimers()
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

it('starts nearby streets collapsed and identifies each canonical choice, including name-only rows', async () => {
  const street = {
    id: 'hollywood',
    name: 'Hollywood Road',
    names: {},
    divisionCodes: [],
  }
  const onSelectStreet = vi.fn()
  const translated = {
    id: 'tai-ping-shan',
    names: { en: '', 'zh-Hant': '太平山街' },
    divisionCodes: [],
  }
  const view = render(Fixture, {
    streetCandidates: [
      { street, distance: 4 },
      { street: translated, distance: 26 },
    ],
    onSelectStreet,
  })
  const details = view.container.querySelector('details')!
  expect(details.open).toBe(false)
  expect(view.getByText('Nearby streets from map')).toBeTruthy()
  await fireEvent.click(details.querySelector('summary')!)
  expect(details.open).toBe(true)
  expect(view.getByRole('button', { name: '太平山街 26 m Use street' })).toBeTruthy()
  await fireEvent.click(
    view.getByRole('button', { name: 'Hollywood Road 4 m Use street' }),
  )
  expect(onSelectStreet).toHaveBeenCalledExactlyOnceWith(street)
})

it('keeps Cancel outside the collapsed street choices', async () => {
  const onCancelLookup = vi.fn()
  const street = {
    id: 'hollywood',
    name: 'Hollywood Road',
    names: {},
    divisionCodes: [],
  }
  const view = render(Fixture, {
    streetCandidates: [{ street, distance: 4 }],
    onSelectStreet: vi.fn(),
    onCancelLookup,
  })
  const details = view.container.querySelector('details')!
  expect(details.open).toBe(false)
  const cancel = view.getByRole('button', { name: 'Cancel' })
  expect(cancel.closest('details')).toBeNull()
  await fireEvent.click(cancel)
  expect(onCancelLookup).toHaveBeenCalledOnce()
})
