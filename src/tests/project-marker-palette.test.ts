// TESTING
import { describe, expect, it } from 'vitest'
// API
import {
  getProjectWithRelations,
  toEntityResponseShape,
} from '#lib/api/services/project.js'
// SCHEMA
import { ProjectCompactProfileAPI } from '#lib/db/zod/schema/project.js'

describe('compact project marker palettes', () => {
  it('loads the assigned palette for compact project queries', () => {
    expect(getProjectWithRelations('compact')).toHaveProperty(
      'mapStyleAssignment.with.mapStyle.with.i18n',
      true,
    )
  })

  it.each(['neorange', 'ghostery', null])(
    'preserves the %s palette through the compact API response',
    async code => {
      const timestamp = '2026-10-19T00:00:00Z'
      const row = {
        id: 'project',
        organisationId: 'organisation',
        code: 'project',
        useAllInOrgContext: false,
        isPublished: true,
        isArchived: false,
        createdAt: timestamp,
        modifiedAt: timestamp,
        i18n: [],
        mapStyleAssignment: code
          ? {
              mapStyle: {
                id: 'style',
                code,
                organisationId: null,
                hubId: null,
                previewImagePath: null,
                createdAt: timestamp,
                modifiedAt: timestamp,
                i18n: [],
              },
            }
          : null,
      }
      const response = await toEntityResponseShape(row as never, 'compact')
      expect(response.data?.mapStyle?.code ?? null).toBe(code)
      const compact = ProjectCompactProfileAPI.parse(response.data)
      expect(compact.mapStyle?.code ?? null).toBe(code)
    },
  )
})
