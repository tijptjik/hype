import { describe, expect, it } from 'vitest'
import { getDevelopmentHubOverride } from '#lib/server/developmentHub.js'

describe('development hub routing', () => {
  const document = 'http://hype.localhost/?hub=hkghostsigns&panel=settings&panel=hub'

  it.each(['/_app/remote/resource/getLayers', '/api/mapStyles/ghostery'])(
    'keeps %s in the document hub',
    path => {
      expect(getDevelopmentHubOverride(new URL(path, document), document, true)).toBe(
        'hkghostsigns',
      )
    },
  )

  it('prefers an explicit override and never enables overrides in production', () => {
    const url = new URL('/_app/remote/resource?hub=breadline', document)
    expect(getDevelopmentHubOverride(url, document, true)).toBe('breadline')
    expect(getDevelopmentHubOverride(url, document, false)).toBeUndefined()
  })

  it('does not inherit overrides across origins or document navigations', () => {
    expect(
      getDevelopmentHubOverride(
        new URL('/_app/remote/resource', document),
        'https://elsewhere.test/?hub=hkghostsigns',
        true,
      ),
    ).toBeUndefined()
    expect(
      getDevelopmentHubOverride(new URL('/', document), document, true),
    ).toBeUndefined()
    expect(
      getDevelopmentHubOverride(
        new URL('/_app/remote/resource', document),
        'invalid',
        true,
      ),
    ).toBeUndefined()
  })
})
