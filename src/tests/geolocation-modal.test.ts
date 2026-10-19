// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import GeoLocationModal from '#lib/bits/patterns/cards/featureCard/modals/GeoLocationModal.svelte'

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  draft: {
    mode: 'location',
    current: { feature: { geometry: { type: 'Point', coordinates: [114.1, 22.3] } } },
    updateField: vi.fn(),
    updateI18n: vi.fn(),
    setMode: vi.fn(),
  },
  cancel: vi.fn(),
}))
vi.mock('#lib/api/external/geocoding.js', () => ({ geocodeAddress: mocks.lookup }))
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => ({ draft: mocks.draft }),
}))
vi.mock('#lib/context/omni.svelte.js', () => ({
  getOmniCtx: () => ({ cancelNewFeature: mocks.cancel }),
}))
vi.mock('#lib/context/responsive.svelte.js', () => ({
  getResponsiveCtx: () => ({ visibleWindowWidth: 800 }),
}))
vi.mock('#lib/context/surfaceLayout.svelte.js', () => ({
  getSurfaceLayoutCtx: () => ({ getAppMainOffsetX: () => 0 }),
  SurfaceLayout: class {},
}))
vi.mock('#lib/bits/index.js', async () => ({
  Icon: (await import('./mocks/svelte-component.svelte')).default,
}))
vi.mock('#lib/i18n.js', () => ({
  getLocaleKey: () => 'en',
  toFormLocaleRecord: (value: unknown) => value,
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mocks.draft.mode = 'location'
  mocks.draft.current = {
    feature: { geometry: { type: 'Point', coordinates: [114.1, 22.3] } },
  }
  mocks.draft.updateField.mockImplementation((key, value) => {
    mocks.draft.current = { feature: { ...mocks.draft.current.feature, [key]: value } }
  })
})
afterEach(cleanup)

const result = {
  i18n: {
    en: { displayAddress: '3 Kennedy Rd', displayAddressGen: true },
    zhHant: { displayAddress: '堅尼地道3號', displayAddressGen: true },
    zhHans: { displayAddress: '坚尼地道3号', displayAddressGen: true },
  },
}

it('uses the selected pin and accepts localized street labels without replacing the pin', async () => {
  mocks.lookup.mockResolvedValue(result)
  const view = render(GeoLocationModal, { getMapCenter: () => [114.16, 22.28] })
  await fireEvent.click(view.getByText('new_feature__select_location'))
  await waitFor(() => expect(view.getByDisplayValue('3 Kennedy Rd')).toBeTruthy())
  expect(mocks.lookup).toHaveBeenCalledWith({ lng: 114.16, lat: 22.28 })
  expect(mocks.draft.updateField).toHaveBeenCalledTimes(1)
  await fireEvent.click(view.getByText('close_shy_jurgen_cook'))
  expect(mocks.draft.updateI18n).toHaveBeenCalledWith(
    'displayAddress',
    '堅尼地道3號',
    'zhHant',
  )
  expect(mocks.draft.setMode).toHaveBeenCalledWith('card')
})

it('clears an earlier address on failed reacquisition and permits manual entry', async () => {
  mocks.lookup.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('503'))
  const view = render(GeoLocationModal, { getMapCenter: () => [114.16, 22.28] })
  await fireEvent.click(view.getByText('new_feature__select_location'))
  await waitFor(() => expect(view.getByDisplayValue('3 Kennedy Rd')).toBeTruthy())
  await fireEvent.click(view.getByText('new_feature__reacquire_location'))
  await waitFor(() =>
    expect(view.getByText('new_feature__address_lookup_failed')).toBeTruthy(),
  )
  expect(view.queryByDisplayValue('3 Kennedy Rd')).toBeNull()
  expect((view.getByText('close_shy_jurgen_cook') as HTMLButtonElement).disabled).toBe(
    true,
  )
  await fireEvent.input(view.getByRole('textbox'), {
    target: { value: '5 Kennedy Rd' },
  })
  await fireEvent.click(view.getByText('close_shy_jurgen_cook'))
  expect(mocks.draft.updateI18n).toHaveBeenCalledWith('displayAddressGen', false, 'en')
})

it('does not apply a pending response after closing the pinpointer', async () => {
  let resolve!: (value: typeof result) => void
  mocks.lookup.mockReturnValue(
    new Promise(done => {
      resolve = done
    }),
  )
  const view = render(GeoLocationModal, { getMapCenter: () => [114.16, 22.28] })
  await fireEvent.click(view.getByText('new_feature__select_location'))
  await fireEvent.keyDown(window, { key: 'Escape' })
  expect(mocks.cancel).toHaveBeenCalledTimes(1)
  resolve(result)
  await waitFor(() => expect(view.queryByDisplayValue('3 Kennedy Rd')).toBeNull())
  expect(mocks.draft.updateI18n).not.toHaveBeenCalled()
})
