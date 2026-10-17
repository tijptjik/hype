// TESTING
import { describe, expect, it, vi } from 'vitest'
// SERVICES
import {
  DEFAULT_NEW_FEATURE_COORDINATES,
  initAddNewFeature,
} from '#lib/client/services/feature.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'

vi.mock('#lib/client/services/task.js', () => ({
  upsertNewFeatureDraft: vi.fn(async () => ({
    task: { id: 'task' },
    featureId: 'feature',
  })),
}))

describe('new-feature camera capability', () => {
  it.each([
    { center: [114.2, 22.4] as [number, number], expected: [114.2, 22.4] },
    { center: null, expected: DEFAULT_NEW_FEATURE_COORDINATES },
  ])(
    'uses explicit camera coordinates or falls back without a map: $center',
    async ({ center, expected }) => {
      const setNewFeature = vi.fn()
      const app = {
        getUser: () => ({ id: 'user', isAnonymous: false }),
        scope: { prisms: { layer: ['layer'] } },
        cache: { layer: new Map([['layer', { id: 'layer' }]]) },
        getHierarchy: async () => ({ layer: { id: 'layer' } }),
        draft: { current: null, set: setNewFeature, update: vi.fn(), setMode: vi.fn() },
      } as unknown as ResourceViewCtx
      await initAddNewFeature(app, { setMode: vi.fn() } as unknown as OmniCtx, null, {
        navigateToRoute: false,
        getMapCenter: () => center,
      })
      expect(setNewFeature).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: expect.objectContaining({
            geometry: { type: 'Point', coordinates: expected },
          }),
        }),
      )
    },
  )
})
