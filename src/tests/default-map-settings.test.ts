// TESTING
import { describe, expect, it } from 'vitest'
import { createFeatureQueryEffectRoot } from './fixtures/featureQueryHarness.svelte'
// ADAPTER
import { useDefaultMapSettingsModel } from '#lib/adapters/panels/useDefaultMapSettingsModel.svelte.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

describe('default map settings choices', () => {
  it('keeps the complete selection independent of an empty or filtered panel page', () => {
    const dispose = createFeatureQueryEffectRoot(() => {
      const app = {
        account: { revision: 0 },
        scope: {
          selectionLayers: [
            { id: 'outside-page', rank: 1, i18n: { en: { name: 'Outside page' } } },
            { id: 'first', rank: 0, i18n: { en: { name: 'First' } } },
          ],
        },
        state: { resources: { layer: [] } },
        getUserLayerIds: () => ['outside-page'],
        getUserPreferences: () => ({}),
        hub: { code: 'core' },
      } as unknown as ResourceViewCtx
      const model = useDefaultMapSettingsModel(app)
      expect(model.orderedLayers.map(layer => layer.id)).toEqual([
        'first',
        'outside-page',
      ])
      expect(model.userLayerIds.has('outside-page')).toBe(true)
    })
    dispose()
  })
})
