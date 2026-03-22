import { describe, expect, it, vi } from 'vitest'

const { navigateOnAdminMock } = vi.hoisted(() => ({
  navigateOnAdminMock: vi.fn(),
}))

vi.mock('svelte-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('$lib/navigation/admin', () => ({
  navigateOnAdmin: navigateOnAdminMock,
  shouldRedirectToSubmittedCode: ({
    adminCtx,
    data,
    success,
    isRefCode = true,
  }: {
    adminCtx: { activeResourceRef?: string | false }
    data: unknown
    success: boolean
    isRefCode?: boolean
  }) => {
    if (!success || !isRefCode) return false
    const submittedCode =
      (data as { data?: { code?: string } })?.data?.code?.trim?.() ?? ''
    const currentRef = adminCtx.activeResourceRef
    return Boolean(
      submittedCode && typeof currentRef === 'string' && submittedCode !== currentRef,
    )
  },
  navigateToSubmittedCode: ({
    adminCtx,
    resourceType,
    data,
  }: {
    adminCtx: { activeFacet?: string }
    resourceType: FirstClassResource
    data: unknown
  }) => {
    const submittedCode =
      (data as { data?: { code?: string } })?.data?.code?.trim?.() ?? ''
    if (!submittedCode) return
    navigateOnAdminMock(
      adminCtx,
      resourceType,
      submittedCode,
      adminCtx.activeFacet || undefined,
    )
  },
}))

vi.mock('$lib/navigation/facets', () => ({
  getAdminFacetActionLabel: vi.fn(() => ''),
}))

import { FirstClassResource } from '$lib/enums'
import {
  createCodeRefResourceResult,
  revalidateAfterSubmitAttempt,
  resolveFacetTabsWithIssues,
  resolveDisplayUserRoles,
} from '$lib/client/services/form'
import type { AdminCtx } from '$lib/context/admin.svelte'

describe('form helpers', () => {
  it('createCodeRefResourceResult wires success, redirect decision and navigation', async () => {
    const setEditing = vi.fn()
    const adminCtx = {
      activeResourceRef: 'old-code',
      activeFacet: 'core',
    } as unknown as AdminCtx
    const helper = createCodeRefResourceResult({
      adminCtx,
      headerCtrl: { setEditing },
      resourceType: FirstClassResource.organisation,
    })

    helper.onSuccess()
    expect(setEditing).toHaveBeenCalledWith(false)

    expect(
      helper.shouldRedirect({ data: { data: { code: 'new-code' } }, success: true }),
    ).toBe(true)
    expect(
      helper.shouldRedirect({ data: { data: { code: 'old-code' } }, success: true }),
    ).toBe(false)
    expect(
      helper.shouldRedirect({ data: { data: { code: 'new-code' } }, success: false }),
    ).toBe(false)

    helper.onRedirect({ data: { data: { code: 'new-code' } } })
    await vi.waitFor(() => {
      expect(navigateOnAdminMock).toHaveBeenCalled()
    })
    expect(navigateOnAdminMock).toHaveBeenCalledWith(
      adminCtx,
      FirstClassResource.organisation,
      'new-code',
      'core',
    )
  })

  it('resolveDisplayUserRoles overlays role values by userId while preserving rows', () => {
    const base = [
      {
        userId: 'u1',
        role: 'member',
        organisationId: 'org-1',
        user: { id: 'u1', name: 'Alpha' },
      },
      {
        userId: 'u2',
        role: 'owner',
        organisationId: 'org-1',
        user: { id: 'u2', name: 'Beta' },
      },
    ]

    const result = resolveDisplayUserRoles({
      baseRoles: base,
      formUserRoles: [
        { userId: 'u1', role: 'owner' },
        { userId: 'u2', role: 'owner' },
      ],
    })

    expect(result).toHaveLength(2)
    expect(result[0]?.role).toBe('owner')
    expect(result[1]?.role).toBe('owner')
    expect(result[0]?.organisationId).toBe('org-1')
    expect(result[0]?.user?.name).toBe('Alpha')
  })

  it('revalidateAfterSubmitAttempt only runs validate after submit was attempted', () => {
    const validate = vi.fn(async () => undefined)

    expect(
      revalidateAfterSubmitAttempt({
        wasSubmitAttempted: false,
        validate,
      }),
    ).toBe(false)
    expect(validate).toHaveBeenCalledTimes(0)

    expect(
      revalidateAfterSubmitAttempt({
        wasSubmitAttempted: true,
        validate,
      }),
    ).toBe(true)
    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('maps data.layers issues onto the layers facet', () => {
    const facets = new Map([
      ['core', { label: 'Core' }],
      ['layers', { label: 'Layers' }],
      ['fields', { label: 'Fields' }],
    ])

    const result = resolveFacetTabsWithIssues({
      issues: [
        {
          path: ['data', 'layers'],
          message: 'At least one layer must be visible by default.',
        },
      ],
      facets,
    })

    expect(result.facetIssueSummary.firstFacetWithIssues).toBe('layers')
    expect(result.facetIssueSummary.facetsWithIssues.has('layers')).toBe(true)
    expect(result.facetTabsWithIssues.get('layers')?.hasIssues).toBe(true)
    expect(result.facetTabsWithIssues.get('core')?.hasIssues).toBe(false)
  })
})
