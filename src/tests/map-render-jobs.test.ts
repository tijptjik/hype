import { describe, expect, it } from 'vitest'

import { buildMapRenderJob, buildMapRenderUrl } from '$lib/map/renders/jobs.server'
import {
  buildMapStyleMapRenderJob,
  buildMapStyleRenderUrl,
} from '$lib/map/styles/render.jobs.server'

describe('map render job helpers', () => {
  it('builds protected layer headless render URLs', () => {
    expect(
      buildMapRenderUrl(
        'https://preview.hype.hk',
        'layers',
        'layer-123',
        'secret-token',
      ),
    ).toBe(
      'https://preview.hype.hk/headless/map-layer-render/layer-123?token=secret-token',
    )
  })

  it('builds queue payloads for project previews', () => {
    expect(
      buildMapRenderJob(
        'https://hype.hk',
        'projects',
        'project-123',
        'abc123',
        'render-token',
      ),
    ).toEqual({
      kind: 'projects',
      identifier: 'project-123',
      hash: 'abc123',
      sourceUrl:
        'https://hype.hk/headless/map-project-render/project-123?token=render-token',
      targetObjectKey: 'mapRender/projects/project-123/abc123.png',
    })
  })

  it('builds queue payloads for map style previews', () => {
    expect(buildMapStyleRenderUrl('https://preview.hype.hk', 'hyper')).toBe(
      'https://preview.hype.hk/headless/map-style-render/hyper?lng=114.16834&lat=22.32412&zoom=17.83&bearing=15.2&pitch=0.5',
    )

    expect(
      buildMapStyleMapRenderJob('https://preview.hype.hk', 'hyper', 'style-hash'),
    ).toEqual({
      kind: 'styles',
      identifier: 'hyper',
      hash: 'style-hash',
      sourceUrl:
        'https://preview.hype.hk/headless/map-style-render/hyper?lng=114.16834&lat=22.32412&zoom=17.83&bearing=15.2&pitch=0.5',
      targetObjectKey: 'mapRender/styles/hyper/style-hash.png',
    })
  })
})
