// @vitest-environment jsdom
// TEST
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import Portal from '#lib/bits/patterns/cards/featureCard/components/content/FeatureCardContentPortal.svelte'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => ({
    getUserPreferences: () => ({ fallbackLocales: ['en', 'zh-hant'] }),
  }),
}))
vi.mock('svelte/transition', () => ({ fly: () => ({ duration: 0 }) }))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
const feature = {
  id: 'feature',
  i18n: { en: { title: 'Independent title', displayAddress: '' } },
  locationNames: { en: 'Martin Express' },
} as unknown as Feature

it('shows a separate venue label without changing the Feature title or address', () => {
  const view = render(Portal, { feature })
  expect(view.container.querySelector('[data-feature-venue]')?.textContent).toContain(
    'Martin Express',
  )
  expect(feature.i18n?.en?.title).toBe('Independent title')
  expect(feature.i18n?.en?.displayAddress).toBe('')
})

it('uses published fallback names and removes the label when the association disappears', async () => {
  const view = render(Portal, {
    feature: { ...feature, locationNames: { 'zh-hant': '場所名稱' } },
  })
  expect(view.getByText('場所名稱')).toBeTruthy()
  await view.rerender({ feature: { ...feature, locationNames: null } })
  expect(view.container.querySelector('[data-feature-venue]')).toBeNull()
})
