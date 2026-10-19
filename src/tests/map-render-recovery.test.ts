// TESTING
import { describe, expect, it, vi } from 'vitest'
// API
import { serveMapRenderAsset } from '#lib/api/services/render.js'
import {
  enqueueMissingMapRender,
  findLastSuccessfulMapRender,
} from '#lib/map/renders/recovery.server.js'
// TYPES
import type { R2Bucket } from '@cloudflare/workers-types'

const job = {
  kind: 'projects' as const,
  identifier: 'item',
  hash: 'new',
  targetObjectKey: 'mapRender/projects/item/new.png',
  sourceUrl: 'https://hype.hk/headless/map-project-render/item',
}

const setup = () => {
  const bucket = {
    head: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({ etag: 'lease' }),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  }
  const send = vi.fn().mockResolvedValue(undefined)
  const platform = {
    env: {
      ENVIRONMENT: 'production',
      PUBLIC_ORIGIN: 'https://hype.hk',
      ASSET_PUBLIC_PRODUCTION: bucket,
      MAP_RENDER_QUEUE: { send },
    },
  } as unknown as App.Platform
  const serve = () =>
    serveMapRenderAsset({
      platform,
      stage: 'production',
      kind: job.kind,
      identifier: job.identifier,
      hash: job.hash,
      objectKey: job.targetObjectKey,
      notFoundMessage: 'Missing',
    })
  return { bucket, send, serve }
}
const image = (hash: string, uploaded: number) => ({
  key: `mapRender/projects/item/${hash}.png`,
  size: 100,
  uploaded: new Date(uploaded),
})

describe('map preview recovery', () => {
  it('keeps an existing version visible while queuing the new hash, then switches when ready', async () => {
    const { bucket, send, serve } = setup()
    bucket.list.mockResolvedValue({ objects: [image('old', 1)], truncated: false })
    const stale = await serve()
    expect(stale.status).toBe(307)
    expect(stale.headers.get('location')).toContain('/old.png')
    expect(stale.headers.get('cache-control')).toBe('no-store')
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(job)

    bucket.head.mockResolvedValue({ key: job.targetObjectKey })
    const fresh = await serve()
    expect(fresh.headers.get('location')).toContain('/new.png')
    expect(send).toHaveBeenCalledOnce()
  })

  it('keeps the old image when the queue fails', async () => {
    const { bucket, send, serve } = setup()
    bucket.list.mockResolvedValue({ objects: [image('old', 1)], truncated: false })
    send.mockRejectedValue(new Error('Unavailable'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await serve()).headers.get('location')).toContain('/old.png')
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('queues a first preview without caching its temporary 404', async () => {
    const { send, serve } = setup()
    const response = await serve()
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(send).toHaveBeenCalledOnce()
  })

  it('finds the newest completed PNG across lexicographically ordered pages', async () => {
    const { bucket } = setup()
    bucket.list
      .mockResolvedValueOnce({
        objects: [image('aaa', 10), { ...image('invalid', 30), size: 0 }],
        truncated: true,
        cursor: 'page2',
      })
      .mockResolvedValueOnce({
        objects: [image('zzz', 5), image('newest', 20)],
        truncated: false,
      })
    expect(
      await findLastSuccessfulMapRender(
        bucket as unknown as R2Bucket,
        'mapRender/projects/item/',
      ),
    ).toContain('/newest.png')
    expect(bucket.list).toHaveBeenLastCalledWith({
      prefix: 'mapRender/projects/item/',
      cursor: 'page2',
    })
  })

  it('does not enqueue versions already present', async () => {
    const { bucket, send } = setup()
    bucket.head.mockResolvedValue({})
    expect(
      await enqueueMissingMapRender(bucket as unknown as R2Bucket, { send }, job),
    ).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('suppresses repeated requests during the repair lease', async () => {
    const { bucket, send } = setup()
    bucket.head
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ uploaded: new Date() })
    expect(
      await enqueueMissingMapRender(bucket as unknown as R2Bucket, { send }, job),
    ).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('does not enqueue when another isolate wins the conditional lease write', async () => {
    const { bucket, send } = setup()
    bucket.put.mockResolvedValue(null)
    expect(
      await enqueueMissingMapRender(bucket as unknown as R2Bucket, { send }, job),
    ).toBe(false)
    expect(bucket.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ onlyIf: { etagDoesNotMatch: '*' } }),
    )
    expect(send).not.toHaveBeenCalled()
  })

  it('recovers an expired lease with compare-and-swap', async () => {
    const { bucket, send } = setup()
    bucket.head
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ uploaded: new Date(0), etag: 'previous' })
    expect(
      await enqueueMissingMapRender(bucket as unknown as R2Bucket, { send }, job),
    ).toBe(true)
    expect(bucket.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ onlyIf: { etagMatches: 'previous' } }),
    )
    expect(send).toHaveBeenCalledOnce()
  })
})
