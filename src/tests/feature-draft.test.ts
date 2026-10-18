// TESTING
import { describe, expect, it } from 'vitest'
// CONTEXT
import { FeatureDraft } from '#lib/context/featureDraft.svelte.js'
import { NewFeatureMode, supportedLocaleKeys } from '#lib/enums.js'

describe('FeatureDraft', () => {
  it('initializes locales and preserves sibling fields through updates', () => {
    const draft = new FeatureDraft()
    draft.set({
      layerId: 'layer',
      feature: { geometry: { type: 'Point', coordinates: [114, 22] } },
    })
    expect(Object.keys(draft.current?.feature?.i18n ?? {})).toEqual(supportedLocaleKeys)
    draft.updateI18n('title', 'English title', 'en')
    draft.updateI18n('title', '中文名稱', 'zhHant')
    draft.updateField('layerId', 'layer')
    draft.update({ taskId: 'task', feature: { layerId: 'layer' } })
    expect(draft.current).toMatchObject({
      layerId: 'layer',
      taskId: 'task',
      feature: {
        geometry: { type: 'Point', coordinates: [114, 22] },
        layerId: 'layer',
        i18n: { en: { title: 'English title' }, zhHant: { title: '中文名稱' } },
      },
    })
  })

  it('preserves supplied locales and keeps payload and mode resets explicit', () => {
    const draft = new FeatureDraft()
    const other = new FeatureDraft()
    draft.set({ feature: { i18n: { en: { title: 'Retained' } } } })
    expect(draft.current?.feature?.i18n).toEqual({ en: { title: 'Retained' } })
    draft.setMode(NewFeatureMode.parents)
    draft.reset()
    expect(draft.current).toBeNull()
    expect(draft.mode).toBe(NewFeatureMode.parents)
    draft.resetMode()
    expect(draft.mode).toBeNull()
    expect(other.current).toBeNull()
    expect(other.mode).toBeNull()
  })
})
