import { describe, expect, it } from 'vitest'

import { toSafeListResponse } from '$lib/remote'

describe('toSafeListResponse', () => {
  it('normalizes a missing remote payload to an empty list response', () => {
    expect(toSafeListResponse(undefined)).toEqual({
      data: [],
      limit: undefined,
      offset: 0,
      totalCount: 0,
      hasMore: false,
      nextOffset: null,
      sortBy: undefined,
      sortOrder: undefined,
      appliedFilters: undefined,
      q: undefined,
      durationMs: undefined,
    })
  })

  it('preserves populated list response metadata', () => {
    expect(
      toSafeListResponse({
        data: [{ id: 'org-1' }],
        totalCount: 5,
        hasMore: true,
        nextOffset: 20,
        sortBy: 'modifiedAt',
        sortOrder: 'desc',
      }),
    ).toEqual({
      data: [{ id: 'org-1' }],
      limit: undefined,
      offset: 0,
      totalCount: 5,
      hasMore: true,
      nextOffset: 20,
      sortBy: 'modifiedAt',
      sortOrder: 'desc',
      appliedFilters: undefined,
      q: undefined,
      durationMs: undefined,
    })
  })
})
