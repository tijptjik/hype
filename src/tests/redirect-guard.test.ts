import { describe, expect, it } from 'vitest'

import { isPublicUnauthenticatedPath } from '$lib/auth/redirectGuard'

describe('isPublicUnauthenticatedPath', () => {
  it('keeps policy pages publicly reachable', () => {
    expect(isPublicUnauthenticatedPath('/policy/privacy')).toBe(true)
    expect(isPublicUnauthenticatedPath('/policy/terms')).toBe(true)
  })

  it('keeps existing public infrastructure routes reachable', () => {
    expect(isPublicUnauthenticatedPath('/')).toBe(true)
    expect(isPublicUnauthenticatedPath('/api/auth/session')).toBe(true)
    expect(isPublicUnauthenticatedPath('/manifest.webmanifest')).toBe(true)
  })

  it('requires authentication for app routes', () => {
    expect(isPublicUnauthenticatedPath('/map')).toBe(false)
    expect(isPublicUnauthenticatedPath('/admin')).toBe(false)
  })
})
