// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Details from '#lib/bits/patterns/cards/featureCard/components/images/FeatureCardAttributionDetails.svelte'
import { captureLabel } from '#lib/images/capturePresentation.js'
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('shows a date-only photograph date independently of upload and record dates', () => {
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
    imageUploadedAt: '2026-10-21',
    featureCreatedAt: '2026-01-01',
  })
  expect(view.getByText('2025-03-14')).toBeTruthy()
  expect(view.getByText('2026-10-21')).toBeTruthy()
  expect(view.getByText('2026-01-01')).toBeTruthy()
  expect(view.getByText('Photographer')).toBeTruthy()
  expect(view.getByText('Record contributor')).toBeTruthy()
  expect(view.getByText('Camera A')).toBeTruthy()
  expect(view.getByText('1200 × 1600')).toBeTruthy()
})

it('never substitutes the upload date for a missing photograph date', async () => {
  const view = render(Details, { metadata: null, imageUploadedAt: '2026-10-21' })
  expect(view.getByText('Date unknown')).toBeTruthy()
  await view.rerender({
    metadata: { capturedAt: '2021-11-22', credit: 'Embedded photographer' },
  })
  expect(view.queryByText('Date unknown')).toBeNull()
  expect(view.getByText('2021-11-22')).toBeTruthy()
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
