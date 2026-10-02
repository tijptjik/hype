import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveRuntimeMapStyle } from '#lib/map/styles/runtime.js'

const style = {
  version: 8,
  sources: {},
  layers: [
    { id: 'water', type: 'fill', paint: { 'fill-color': '#123456' } },
    { id: 'labels', type: 'symbol', layout: { visibility: 'visible' } },
  ],
} as never

describe('runtime map styles', () => {
  afterEach(() => vi.restoreAllMocks())

  it('forwards locale and no-label options and transforms symbol layers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(style), { status: 200 }))

    const resolved = await resolveRuntimeMapStyle('ghostery', {
      locale: 'zhHant',
      noLabels: true,
      retryCount: 0,
    })

    const requestUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(requestUrl).toContain('/api/mapStyles/ghostery')
    expect(requestUrl).toContain('locale=zhHant')
    expect(requestUrl).toContain('noLabels=1')
    expect(resolved.layers?.[1]).toMatchObject({ layout: { visibility: 'none' } })
  })

  it('retries transient failures and stops at the configured bound', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(new Response(JSON.stringify(style), { status: 200 }))

    await expect(
      resolveRuntimeMapStyle('ghostery', { retryCount: 1 }),
    ).resolves.toEqual(style)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry an aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(
      resolveRuntimeMapStyle('ghostery', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
