// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Details from '#lib/bits/patterns/cards/featureCard/components/images/FeatureCardAttributionDetails.svelte'
import { captureLabel } from '#lib/images/capturePresentation.js'
const originalAnimate = Element.prototype.animate
beforeEach(() => {
  vi.useRealTimers()
  // JSDOM has no Web Animations API; interaction assertions do not measure motion.
  Element.prototype.animate = () => ({ cancel() {} }) as Animation
})
afterEach(() => {
  cleanup()
  Element.prototype.animate = originalAnimate
})

it('shows a date-only photograph date independently of upload and record dates', async () => {
  const view = render(Details, {
    metadata: {
      capture: {
        value: '2025-03-14',
        precision: 'day',
        endValue: null,
        endPrecision: null,
        approximate: false,
        originalText: 'Photographed on 2025-03-14',
      },
      cameraModel: 'Camera A',
      originalWidth: 1200,
      originalHeight: 1600,
    },
    imageCredit: 'Photographer',
    featureCredit: 'Record contributor',
    featureCreatedAt: '2026-01-01',
  })
  expect(
    view.container
      .querySelector('time[datetime="2025-03-14"]')
      ?.getAttribute('data-tooltip'),
  ).toBe('2025-03-14')
  expect(view.queryByText('Uploaded')).toBeNull()
  expect(view.container.querySelector('time[datetime="2026-01-01"]')).toBeTruthy()
  expect(view.getByText('Photographer')).toBeTruthy()
  expect(view.getByText('Record contributor')).toBeTruthy()
  expect(view.queryByText('Camera A')).toBeNull()
  expect(view.queryByText('1200 × 1600')).toBeNull()
  const camera = view.getByRole('button', { name: 'Open image metadata' })
  expect(camera.getAttribute('aria-expanded')).toBe('false')
  await fireEvent.click(camera)
  expect(camera.getAttribute('aria-expanded')).toBe('true')
  expect(view.getByText('Camera A')).toBeTruthy()
  expect(view.getByText('1200 × 1600')).toBeTruthy()
})

it('never substitutes the upload date for a missing photograph date', async () => {
  const view = render(Details, { metadata: null })
  expect(view.getByText('Date unknown')).toBeTruthy()
  await view.rerender({
    metadata: { capturedAt: '2021-11-22', credit: 'Embedded photographer' },
  })
  expect(view.queryByText('Date unknown')).toBeNull()
  expect(view.container.querySelector('time[datetime="2021-11-22"]')).toBeTruthy()
  expect(view.getByText('Embedded photographer')).toBeTruthy()
})

it('retains approximate month and range precision without fabricating a day or time', () => {
  expect(
    captureLabel({
      value: '2022-02',
      precision: 'month',
      endValue: '2022-04',
      endPrecision: 'month',
      approximate: true,
      originalText: 'Spring 2022',
    }),
  ).toBe('≈ 2022-02 – 2022-04')
})

it('opens a contributor in the profile panel while preserving modified-link clicks', async () => {
  const onOpenProfile = vi.fn()
  const view = render(Details, {
    metadata: null,
    imageCredit: 'Photo credit',
    imageUser: {
      id: 'photo-user',
      username: 'photographer',
      displayUsername: 'Photographer',
      attribution: 'Photo credit',
    },
    onOpenProfile,
  })
  const link = view.getByRole('link', { name: /Photo credit/ })
  await fireEvent.click(link)
  expect(onOpenProfile).toHaveBeenCalledWith('photographer')
  onOpenProfile.mockClear()
  await fireEvent.click(link, { ctrlKey: true })
  expect(onOpenProfile).not.toHaveBeenCalled()
  expect(link.getAttribute('href')).toBe('/users/photographer')
})
