import { describe, expect, it } from 'vitest'
import { projectPropertyAudience } from '#lib/properties/audience.server.js'
import { toEntityResponseShape } from '#lib/api/services/layer.js'

describe('layer style at the remote privacy boundary', () => {
  it.each([undefined, null, 'ghostery'] as const)(
    'preserves the meaning of %s',
    async mapStyleCode => {
      const row = {
        id: 'layer',
        historicalSourceLayerId: null,
        organisationId: 'org',
        projectId: 'project',
        rank: 0,
        isDefaultVisible: true,
        createdAt: '2026-10-19T00:00:00Z',
        modifiedAt: '2026-10-19T00:00:00Z',
        isPublished: true,
        isArchived: false,
        i18n: [],
        properties: [],
        metadata: mapStyleCode === undefined ? {} : { mapStyleCode },
      }
      const response = await toEntityResponseShape(row as never, 'default')
      const projected = projectPropertyAudience(response, new Set<string>())
      expect(projected.data.mapStyleCode).toBe(mapStyleCode)
    },
  )

  it('still removes forbidden rows and nulls forbidden nested references', () => {
    const result = projectPropertyAudience(
      { rows: [{ id: 'private' }, { id: 'public' }], reference: { id: 'private' } },
      new Set(['private']),
    )
    expect(result).toEqual({ rows: [{ id: 'public' }], reference: null })
  })
})
