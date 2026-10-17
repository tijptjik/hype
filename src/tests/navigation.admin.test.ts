import { describe, expect, it, vi } from 'vitest'
import { goto } from '$app/navigation'
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import { getBreadcrumbs, navigateOnAdmin } from '#lib/navigation/admin.js'
import { FirstClassResource, ResourcePath } from '#lib/enums.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }))

type Breadcrumb = { name: string; href: string }

function createAppCtxMock(params: {
  resource: unknown
  hierarchy: {
    organisation?: { code: string } | undefined
    project?: { code: string } | undefined
    layer?: { id: string } | undefined
    feature?: { id: string } | undefined
  }
  names?: {
    organisation?: string
    project?: string
    layer?: string
    feature?: string
  }
}): {
  getResourceByRef: ReturnType<typeof vi.fn>
  getHierarchy: ReturnType<typeof vi.fn>
  getOrganisationById: ReturnType<typeof vi.fn>
  getContextualOrganisationName: ReturnType<typeof vi.fn>
  getContextualProjectName: ReturnType<typeof vi.fn>
  getContextualLayerName: ReturnType<typeof vi.fn>
  getContextualFeatureName: ReturnType<typeof vi.fn>
} {
  return {
    getResourceByRef: vi.fn().mockResolvedValue(params.resource),
    getHierarchy: vi.fn().mockResolvedValue(params.hierarchy),
    getOrganisationById: vi
      .fn()
      .mockResolvedValue(
        params.hierarchy.organisation
          ? { id: 'org-id', code: params.hierarchy.organisation.code }
          : undefined,
      ),
    getContextualOrganisationName: vi
      .fn()
      .mockReturnValue(params.names?.organisation ?? 'Organisation'),
    getContextualProjectName: vi
      .fn()
      .mockReturnValue(params.names?.project ?? 'Project'),
    getContextualLayerName: vi.fn().mockReturnValue(params.names?.layer ?? 'Layer'),
    getContextualFeatureName: vi
      .fn()
      .mockReturnValue(params.names?.feature ?? 'Feature'),
  }
}

describe('getBreadcrumbs', () => {
  it('returns [] for organisation entity (no parent breadcrumbs)', async () => {
    const appCtx = createAppCtxMock({
      resource: { code: 'hkghostsigns' },
      hierarchy: {
        organisation: { code: 'hkghostsigns' },
      },
      names: { organisation: 'HK Ghost Signs' },
    })

    const result = await getBreadcrumbs(
      appCtx as unknown as ResourceViewCtx,
      FirstClassResource.organisation,
      'hkghostsigns',
    )

    expect(result).toEqual([])
  })

  it('returns organisation breadcrumb for project entity', async () => {
    const appCtx = createAppCtxMock({
      resource: { code: 'food-accessibility', organisationId: 'org-id' },
      hierarchy: {
        organisation: { code: 'hkghostsigns' },
        project: { code: 'food-accessibility' },
      },
      names: {
        organisation: 'HK Ghost Signs',
        project: 'Food Accessibility',
      },
    })

    const result = await getBreadcrumbs(
      appCtx as unknown as ResourceViewCtx,
      FirstClassResource.project,
      'food-accessibility',
    )

    expect(result).toEqual([
      {
        name: 'HK Ghost Signs',
        href: `/admin/${ResourcePath.organisation}/hkghostsigns`,
      },
    ] satisfies Breadcrumb[])
  })

  it('resolves project parent breadcrumb from organisationId lookup (not project self)', async () => {
    const appCtx = createAppCtxMock({
      resource: { code: 'project-self', organisationId: 'org-parent-id' },
      hierarchy: {
        organisation: { code: 'project-self' },
        project: { code: 'project-self' },
      },
      names: {
        organisation: 'Parent Org',
      },
    })
    appCtx.getOrganisationById.mockResolvedValue({
      id: 'org-parent-id',
      code: 'parent-org',
    })

    const result = await getBreadcrumbs(
      appCtx as unknown as ResourceViewCtx,
      FirstClassResource.project,
      'project-self',
    )

    expect(result).toEqual([
      {
        name: 'Parent Org',
        href: `/admin/${ResourcePath.organisation}/parent-org`,
      },
    ] satisfies Breadcrumb[])
  })

  it('returns org + project for layer when hierarchy includes both parents', async () => {
    const appCtx = createAppCtxMock({
      resource: { id: 'layer-2' },
      hierarchy: {
        organisation: { code: 'parent-org' },
        project: { code: 'child-project' },
        layer: { id: 'layer-2' },
      },
      names: {
        organisation: 'Parent Org',
        project: 'Child Project',
      },
    })

    const result = await getBreadcrumbs(
      appCtx as unknown as ResourceViewCtx,
      FirstClassResource.layer,
      'layer-2',
    )

    expect(result).toEqual([
      {
        name: 'Parent Org',
        href: `/admin/${ResourcePath.organisation}/parent-org`,
      },
      {
        name: 'Child Project',
        href: `/admin/${ResourcePath.project}/child-project`,
      },
    ] satisfies Breadcrumb[])
  })

  it('returns organisation + project breadcrumbs for layer entity', async () => {
    const appCtx = createAppCtxMock({
      resource: { id: 'layer-1' },
      hierarchy: {
        organisation: { code: 'hkghostsigns' },
        project: { code: 'food-accessibility' },
        layer: { id: 'layer-1' },
      },
      names: {
        organisation: 'HK Ghost Signs',
        project: 'Food Accessibility',
      },
    })

    const result = await getBreadcrumbs(
      appCtx as unknown as ResourceViewCtx,
      FirstClassResource.layer,
      'layer-1',
    )

    expect(result).toEqual([
      {
        name: 'HK Ghost Signs',
        href: `/admin/${ResourcePath.organisation}/hkghostsigns`,
      },
      {
        name: 'Food Accessibility',
        href: `/admin/${ResourcePath.project}/food-accessibility`,
      },
    ] satisfies Breadcrumb[])
  })

  it('returns [] when resource cannot be resolved', async () => {
    const appCtx = createAppCtxMock({
      resource: null,
      hierarchy: {},
    })

    const result = await getBreadcrumbs(
      appCtx as unknown as ResourceViewCtx,
      FirstClassResource.project,
      'missing',
    )

    expect(result).toEqual([])
  })
})

describe('admin navigation intent', () => {
  it('waits for the committed URL projection instead of preemptively mutating navigation state', () => {
    const admin = {
      setResourceType: vi.fn(),
      setResourceRef: vi.fn(),
      setFacet: vi.fn(),
    }
    navigateOnAdmin(
      admin as unknown as AdminCtx,
      FirstClassResource.feature,
      'feature-id',
      'images',
    )
    expect(goto).toHaveBeenCalledWith('/admin/features/feature-id#images', {
      reset: false,
      replace: false,
    })
    expect(admin.setResourceType).not.toHaveBeenCalled()
    expect(admin.setResourceRef).not.toHaveBeenCalled()
    expect(admin.setFacet).not.toHaveBeenCalled()
  })
})
