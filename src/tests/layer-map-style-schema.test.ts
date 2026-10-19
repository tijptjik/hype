import { describe, expect, it } from 'vitest'
import { LayerMetadataSchema } from '#lib/db/zod/schema/layer.js'
import { toLayerFormInput } from '#lib/client/services/layer.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'

describe('layer map style metadata', () => {
  it.each([null, 'neorange'] as const)(
    'copies proxy-backed metadata with map style %s without mutating retained state',
    mapStyleCode => {
      const coordinates = new Proxy([114.17, 22.3], {})
      const presentation = new Proxy({ coordinates, zoom: 18 }, {})
      const metadata = new Proxy({ mapStyleCode, presentation }, {})
      const layer = { metadata } as unknown as Layer

      const result = toLayerFormInput(layer).data.metadata
      expect(result).toEqual({
        mapStyleCode: mapStyleCode ?? '',
        presentation: { coordinates: [114.17, 22.3], zoom: 18 },
      })
      expect(() => structuredClone(result)).not.toThrow()
      if (!result) throw new Error('Expected layer form metadata')

      const copiedPresentation = result.presentation as typeof presentation
      copiedPresentation.coordinates[0] = 0
      copiedPresentation.zoom = 10
      expect(coordinates[0]).toBe(114.17)
      expect(presentation.zoom).toBe(18)
      expect(metadata.mapStyleCode).toBe(mapStyleCode)
    },
  )

  it('round-trips User Preference through string form input and nullable persisted metadata', () => {
    expect(LayerMetadataSchema.parse({ mapStyleCode: '', zoom: 18 })).toEqual({
      mapStyleCode: null,
      zoom: 18,
    })
    expect(LayerMetadataSchema.parse({ mapStyleCode: 'neorange' })).toEqual({
      mapStyleCode: 'neorange',
    })
    expect(LayerMetadataSchema.parse({})).toEqual({})
    expect(LayerMetadataSchema.safeParse({ mapStyleCode: 'not-a-style' }).success).toBe(
      false,
    )
    expect(toLayerFormInput().data.metadata).toHaveProperty('mapStyleCode', '')
  })
})

it.each(['compact', 'card', 'list'] as const)(
  'retains the public map preference in %s profiles without exposing metadata',
  async profile => {
    const { toEntityResponseShape } = await import('#lib/api/services/layer.js')
    const row = {
      id: 'layer',
      organisationId: 'org',
      projectId: 'project',
      rank: 0,
      isDefaultVisible: false,
      createdAt: '2026-10-19T00:00:00Z',
      modifiedAt: '2026-10-19T00:00:00Z',
      isPublished: true,
      isArchived: false,
      i18n: [],
      properties: [],
      metadata: { mapStyleCode: null, privateSetting: 'retained' },
    }
    const result = await toEntityResponseShape(row as never, profile)
    expect(result.data).toHaveProperty('mapStyleCode', null)
    expect(result.data).not.toHaveProperty('metadata')
  },
)
