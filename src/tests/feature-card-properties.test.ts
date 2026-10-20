// TESTING
import { describe, expect, it } from 'vitest'
// SERVICES
import { getFeatureCardDisplayProperties } from '#lib/client/services/property.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

const feature = {
  layerId: 'books',
  properties: [
    {
      propertyId: 'author',
      value: 'Karmen Špiljak',
      property: { id: 'author', key: 'author', type: 'specifier' },
    },
    {
      propertyId: 'grade',
      value: 'A',
      property: { id: 'grade', key: 'grade', type: 'classifier' },
    },
  ],
} as unknown as Feature

function context(
  properties?: Array<{ propertyId: string; isVisible: boolean }>,
): ResourceViewCtx {
  return {
    queries: { rows: { layer: [{ id: 'books' }] } },
    cache: {
      property: new Map(),
      layer: new Map(properties ? [['books', { id: 'books', properties }]] : []),
    },
  } as unknown as ResourceViewCtx
}

describe('feature card property hydration', () => {
  it('uses hydrated card properties before layer and property caches are populated', () => {
    expect(getFeatureCardDisplayProperties(context(), 'books', feature)).toEqual([
      feature.properties[0],
    ])
  })

  it('honours detailed layer visibility even when the query row is compact', () => {
    expect(
      getFeatureCardDisplayProperties(
        context([{ propertyId: 'author', isVisible: false }]),
        'books',
        feature,
      ),
    ).toEqual([])
  })

  it('does not require the card layer to be in the current query page', () => {
    const ctx = context()
    ctx.queries.rows.layer = []
    expect(getFeatureCardDisplayProperties(ctx, 'books', feature)).toEqual([
      feature.properties[0],
    ])
  })
})
