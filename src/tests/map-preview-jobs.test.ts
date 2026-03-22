import { describe, expect, it } from 'vitest'

import {
  buildPreviewRenderJob,
  buildPreviewRenderUrl,
} from '$lib/map/previews/jobs.server'

describe('preview render job helpers', () => {
  it('builds protected layer headless render URLs', () => {
    expect(
      buildPreviewRenderUrl(
        'https://preview.hype.hk',
        'layers',
        'layer-123',
        'secret-token',
      ),
    ).toBe(
      'https://preview.hype.hk/headless/map-layer-preview/layer-123?token=secret-token',
    )
  })

  it('builds queue payloads for project previews', () => {
    expect(
      buildPreviewRenderJob(
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
        'https://hype.hk/headless/map-project-preview/project-123?token=render-token',
      targetObjectKey: 'mapPreviews/projects/project-123/abc123.png',
    })
  })
})
