import { describe, expect, it } from 'vitest'

import {
  adminAuthRequiredResponse,
  isAuthEntryPath,
  isPublicUnauthenticatedPath,
} from '#lib/auth/redirectGuard.js'

describe('isAuthEntryPath', () => {
  it('only identifies sign-in and sign-up routes', () => {
    expect(isAuthEntryPath('/signin')).toBe(true)
    expect(isAuthEntryPath('/signup')).toBe(true)
    expect(isAuthEntryPath('/')).toBe(false)
    expect(isAuthEntryPath('/policy/privacy')).toBe(false)
    expect(isAuthEntryPath('/api/auth/session')).toBe(false)
  })
})

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

  it('keeps auth entry routes public', () => {
    expect(isPublicUnauthenticatedPath('/signin')).toBe(true)
    expect(isPublicUnauthenticatedPath('/signup')).toBe(true)
  })

  it('requires authentication for app routes', () => {
    expect(isPublicUnauthenticatedPath('/map')).toBe(false)
    expect(isPublicUnauthenticatedPath('/admin')).toBe(false)
  })
})

describe('admin auth rejection responses', () => {
  it('returns a native JSON error without a redirect for a remote call', async () => {
    const response = adminAuthRequiredResponse('/admin/fieldresearch', true)
    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      type: 'error',
      error: { status: 401, message: 'UNAUTHENTICATED' },
    })
  })
  it('preserves sign-in redirects for normal admin navigation', () => {
    const response = adminAuthRequiredResponse('/admin/fieldresearch?example=1', false)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      '/?upgrade=admin&returnTo=%2Fadmin%2Ffieldresearch%3Fexample%3D1',
    )
  })
})
