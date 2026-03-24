import { describe, expect, it } from 'vitest'

import { buildMapRenderJob, buildMapRenderUrl } from '$lib/map/renders/jobs.server'

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
})
