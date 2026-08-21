import { describe, expect, it } from 'vitest'
import { getSitemapPaths, renderSitemap, toSitemapPath } from '$lib/server/sitemap'

describe('sitemap route discovery', () => {
  it('converts grouped static page modules to public paths', () => {
    expect(toSitemapPath('/src/routes/(app)/+page.svelte')).toBe('/')
    expect(toSitemapPath('/src/routes/policy/privacy/+page.svelte')).toBe(
      '/policy/privacy',
    )
  })

  it('excludes admin, parameterised, utility, and render routes', () => {
    expect(
      getSitemapPaths([
        '/src/routes/(app)/+page.svelte',
        '/src/routes/(app)/features/[id]/+page.svelte',
        '/src/routes/account/reset-password/+page.svelte',
        '/src/routes/admin/features/+page.svelte',
        '/src/routes/headless/map-style-render/[style]/+page.svelte',
        '/src/routes/policy/terms/+page.svelte',
        '/src/routes/signin/+page.svelte',
      ]),
    ).toEqual(['/', '/policy/terms'])
  })
})

describe('sitemap rendering', () => {
  it('renders qualified XML URLs and escapes XML characters', () => {
    const xml = renderSitemap('https://hype.hk/', ['/', '/policy/privacy?a=1&b=2'])

    expect(xml).toContain('<loc>https://hype.hk/</loc>')
    expect(xml).toContain('<loc>https://hype.hk/policy/privacy?a=1&amp;b=2</loc>')
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  })
})
