// TESTS
import { describe, expect, it, vi } from 'vitest'
// NAVIGATION
import { getFeatureBreadcrumbHierarchy } from '#lib/navigation/featureBreadcrumbs.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

type Reader = Parameters<typeof getFeatureBreadcrumbHierarchy>[1]
const feature = {
  id: 'donor',
  layerId: 'donors',
  projectId: 'breadline',
  organisationId: 'charity',
} as Feature
/** Create observable parent reads. @returns Scope-bound lookup fixture. */
function fixture() {
  return {
    getLayerById: vi.fn().mockResolvedValue({ id: 'donors' }),
    getProjectById: vi.fn().mockResolvedValue({ id: 'breadline' }),
    getOrganisationById: vi.fn().mockResolvedValue({ id: 'charity' }),
  }
}
describe('Feature breadcrumb hierarchy', () => {
  it.each(['donors', 'dropoffs'])(
    'keeps a published %s Feature usable with unpublished parents',
    async layerId => {
      const reader = fixture()
      for (const read of Object.values(reader)) read.mockRejectedValue({ status: 403 })
      const result = await getFeatureBreadcrumbHierarchy(
        { ...feature, layerId },
        reader as Reader,
      )
      expect(result).toEqual({
        feature: { ...feature, layerId },
        layer: undefined,
        project: undefined,
        organisation: undefined,
      })
      expect(reader.getLayerById).toHaveBeenCalledWith(layerId)
      expect(reader.getProjectById).toHaveBeenCalledWith('breadline')
      expect(reader.getOrganisationById).toHaveBeenCalledWith('charity')
    },
  )
  it('retains readable ancestors when another parent is forbidden or missing', async () => {
    const reader = fixture()
    reader.getLayerById.mockRejectedValue({ status: 403 })
    reader.getOrganisationById.mockRejectedValue({ status: 404 })
    const result = await getFeatureBreadcrumbHierarchy(feature, reader as Reader)
    expect(result.project).toEqual({ id: 'breadline' })
    expect(result.layer).toBeUndefined()
    expect(result.organisation).toBeUndefined()
  })
  it('shows the complete hierarchy when all parents are readable', async () => {
    const result = await getFeatureBreadcrumbHierarchy(feature, fixture() as Reader)
    expect([result.organisation?.id, result.project?.id, result.layer?.id]).toEqual([
      'charity',
      'breadline',
      'donors',
    ])
  })
  it.each([401, 500, undefined])(
    'does not hide authentication or operational errors (%s)',
    async status => {
      const reader = fixture(),
        error = Object.assign(new Error('Lookup failed'), { status })
      reader.getProjectById.mockRejectedValue(error)
      await expect(
        getFeatureBreadcrumbHierarchy(feature, reader as Reader),
      ).rejects.toBe(error)
    },
  )
})
