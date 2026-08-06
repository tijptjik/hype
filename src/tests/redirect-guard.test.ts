import { describe, expect, it } from 'vitest'

import { isAuthEntryPath, isPublicUnauthenticatedPath } from '$lib/auth/redirectGuard'

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
