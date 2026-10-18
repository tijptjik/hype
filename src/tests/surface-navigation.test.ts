import { describe, expect, it } from 'vitest'
import { SurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'

const url = (path: string): URL => new URL(path, 'https://hype.test')

describe('surface navigation projection', () => {
  it('replaces the complete target on index, detail, shallow facet and history navigation', () => {
    const nav = new SurfaceNavigation()
    nav.syncUrl(url('/admin/features/one#images'), 'admin')
    expect(nav.state).toEqual({
      resourceType: 'feature',
      resourceRef: 'one',
      facet: 'images',
    })
    nav.syncUrl(url('/admin/projects/example#core'), 'admin')
    expect(nav.state).toEqual({
      resourceType: 'project',
      resourceRef: 'example',
      facet: 'core',
    })
    nav.syncUrl(url('/admin/features/one#images'), 'admin')
    expect(nav.state).toEqual({
      resourceType: 'feature',
      resourceRef: 'one',
      facet: 'images',
    })
    nav.syncUrl(url('/admin/features/one#address'), 'admin')
    expect(nav.getActiveFacet()).toBe('address')
    nav.syncUrl(url('/admin/features'), 'admin')
    expect(nav.state).toEqual({
      resourceType: 'feature',
      resourceRef: false,
      facet: false,
    })
    nav.syncUrl(url('/admin/analytics'), 'admin')
    expect(nav.state).toEqual({ resourceType: false, resourceRef: false, facet: false })
  })

  it('preserves page-provided defaults across query changes and resolves codes lazily', () => {
    let id: string | null = null
    const nav = new SurfaceNavigation(() => id)
    nav.syncUrl(url('/admin/projects/my-project'), 'admin')
    nav.setActiveFacet('core')
    nav.syncUrl(url('/admin/projects/my-project?panel=settings'), 'admin')
    expect(nav.getActiveFacet()).toBe('core')
    expect(nav.getActiveResourceId()).toBeNull()
    id = 'project-id'
    expect(nav.getActiveResourceId()).toBe('project-id')
  })

  it('keeps public and admin targets independent', () => {
    const app = new SurfaceNavigation()
    const admin = new SurfaceNavigation()
    app.syncUrl(url('/features/a'), 'app')
    admin.syncUrl(url('/admin/projects/b'), 'admin')
    app.syncUrl(url('/'), 'app')
    expect(app.getActiveResourceRef()).toBe(false)
    expect(admin.getActiveResourceRef()).toBe('b')
  })
})
