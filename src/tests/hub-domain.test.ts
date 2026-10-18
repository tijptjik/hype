import { describe, expect, it } from 'vitest'

import { getHubFromDomain } from '#lib/api/services/hub.js'

describe('getHubFromDomain', () => {
  it('loads the default Core hub on the local Hype origin', () => {
    expect(getHubFromDomain('hype.localhost:4173')).toMatchObject({
      code: 'core',
      domain: 'hype.hk',
      isCore: true,
    })
    expect(getHubFromDomain('hype.localhost', 'breadline')).toEqual({
      code: 'breadline',
    })
  })

  it('treats core preview hosts as core', () => {
    expect(getHubFromDomain('preview.hype.hk')).toMatchObject({
      code: 'core',
      domain: 'hype.hk',
      isCore: true,
    })
  })

  it('normalizes preview hub subdomains to the underlying hub code', () => {
    expect(getHubFromDomain('hkghostsigns.preview.hype.hk')).toEqual({
      code: 'hkghostsigns',
    })
    expect(getHubFromDomain('breadline.preview.hype.hk')).toEqual({
      code: 'breadline',
    })
  })

  it('keeps production hub subdomains unchanged', () => {
    expect(getHubFromDomain('hkghostsigns.hype.hk')).toEqual({
      code: 'hkghostsigns',
    })
  })
})
