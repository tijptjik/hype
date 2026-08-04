import { afterEach, describe, expect, it, vi } from 'vitest'
import scheduler from '../../workers/maintenance-scheduler/src/index'

const environment = {
  APP_BASE_URL: 'https://preview.hype.hk',
  SCHEDULER_SECRET: 'scheduler-secret',
  ANONYMOUS_CLEANUP_TOKEN: 'cleanup-secret',
  MAP_REFRESH_TOKEN: 'refresh-secret',
  RENDER_REFRESH_KINDS: 'layers,projects',
  RENDER_REFRESH_SINCE_HOURS: '24',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('maintenance scheduler tasks', () => {
  it('runs authenticated guest cleanup on the daily cron', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{"deletedCount":2}'))

    await scheduler.scheduled(
      { cron: '15 3 * * *', scheduledTime: 0, noRetry: vi.fn() },
      environment,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://preview.hype.hk/api/maintenance/anonymous-cleanup'),
      {
        method: 'POST',
        headers: { authorization: 'Bearer cleanup-secret' },
      },
    )
  })

  it('keeps hourly render refreshes on the existing endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{"enqueued":2}'))

    await scheduler.scheduled(
      { cron: '0 * * * *', scheduledTime: 0, noRetry: vi.fn() },
      environment,
    )

    const [requestUrl, options] = fetchMock.mock.calls[0]
    expect(String(requestUrl)).toContain('/api/mapRenders/refresh?')
    expect(options).toMatchObject({
      method: 'POST',
      headers: { 'x-map-render-refresh-token': 'refresh-secret' },
    })
  })

  it('rejects undeclared cron expressions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(
      scheduler.scheduled(
        { cron: '30 4 * * *', scheduledTime: 0, noRetry: vi.fn() },
        environment,
      ),
    ).rejects.toThrow('Unknown maintenance schedule: 30 4 * * *')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when a scheduled task returns a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('upstream failure', { status: 503 }),
    )

    await expect(
      scheduler.scheduled(
        { cron: '15 3 * * *', scheduledTime: 0, noRetry: vi.fn() },
        environment,
      ),
    ).rejects.toThrow('Scheduled anonymous-cleanup failed (503')
  })

  it('requires the scheduler secret for manual runs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await scheduler.fetch(
      new Request('https://scheduler.example/run', { method: 'POST' }),
      environment,
    )

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects incorrect scheduler credentials for manual runs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await scheduler.fetch(
      new Request('https://scheduler.example/run', {
        method: 'POST',
        headers: { authorization: 'Bearer incorrect-token' },
      }),
      environment,
    )

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['missing', undefined],
  ])('rejects manual runs when the scheduler secret is %s', async (_state, secret) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await scheduler.fetch(
      new Request('https://scheduler.example/run', {
        method: 'POST',
        headers: { authorization: 'Bearer ' },
      }),
      { ...environment, SCHEDULER_SECRET: secret } as typeof environment,
    )

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows manual runs with the configured scheduler secret', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{"enqueued":2}'))
    const response = await scheduler.fetch(
      new Request('https://scheduler.example/run', {
        method: 'POST',
        headers: { authorization: 'Bearer scheduler-secret' },
      }),
      environment,
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
