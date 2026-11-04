// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Updates from '#lib/bits/patterns/forms/featureLocation/FeatureLocationUpdates.svelte'
import { getFeatureLocation } from '#lib/api/location.remote.js'
import { reviewLatestLocalLocation } from '#lib/api/locationReview.remote.js'
vi.mock('#lib/api/location.remote.js', () => ({ getFeatureLocation: vi.fn() }))
vi.mock('#lib/api/locationReview.remote.js', () => ({
  reviewLatestLocalLocation: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('#lib/bits/patterns/forms/featureLocation/LocationTasks.svelte', async () => ({
  default: (await import('./mocks/svelte-component.svelte')).default,
}))
vi.mock(
  '#lib/bits/patterns/forms/featureLocation/LocationIdentityReviewSection.svelte',
  async () => ({ default: (await import('./mocks/svelte-component.svelte')).default }),
)
vi.mock(
  '#lib/bits/patterns/forms/featureLocation/LocationBrandEditor.svelte',
  async () => ({ default: (await import('./mocks/svelte-component.svelte')).default }),
)
vi.mock(
  '#lib/bits/patterns/forms/featureLocation/LocationResetFields.svelte',
  async () => ({ default: (await import('./mocks/svelte-component.svelte')).default }),
)
const refresh = vi.fn().mockResolvedValue(undefined)
const props = () => ({
  featureId: 'demo',
  isEditing: true,
  isDirty: false,
  onResetFields: vi.fn(),
  onBrandEdit: vi.fn(),
  onUnlink: vi.fn().mockResolvedValue(undefined),
  onSourceUpdate: vi.fn().mockResolvedValue(undefined),
})
function association(status?: string): void {
  const current = {
    locationId: 'closed-shop',
    kind: 'establishment',
    version: 'accepted-v1',
    membershipRevisionIds: [],
    effective: { names: { en: 'Closed shop' }, operatingStatus: status },
  }
  vi.mocked(getFeatureLocation).mockReturnValue(
    Object.assign(Promise.resolve(current), { current, refresh }) as never,
  )
}
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  association()
})
afterEach(cleanup)
it('omits unknown lifecycle and makes no review or unlink command on opening', async () => {
  const callbacks = props()
  render(Updates, callbacks)
  await screen.findByText('Closed shop')
  expect(screen.queryByRole('heading', { name: 'Location status' })).toBeNull()
  expect(reviewLatestLocalLocation).not.toHaveBeenCalled()
  expect(callbacks.onUnlink).not.toHaveBeenCalled()
})
it('shows meaningful Location status and links to the record that owns it', async () => {
  association('permanently_closed')
  render(Updates, props())
  await screen.findByRole('heading', { name: 'Location status' })
  expect(screen.getByText('Permanently closed')).toBeTruthy()
  expect(
    screen.getByRole('link', { name: 'Manage Location' }).getAttribute('href'),
  ).toBe('/admin/locations/closed-shop')
})
it('blocks review and disconnection with unsaved edits', async () => {
  render(Updates, { ...props(), isDirty: true })
  const review = await screen.findByRole('button', {
    name: 'Review latest Location address',
  })
  expect((review as HTMLButtonElement).disabled).toBe(true)
  expect(
    (
      screen.getByRole('button', {
        name: 'Unlink Location (keep current values)',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
})
it('prepares reviews only after an explicit action and refreshes existing evidence', async () => {
  render(Updates, props())
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Review latest Location address' }),
  )
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(reviewLatestLocalLocation).toHaveBeenCalledWith({ featureId: 'demo' })
})
