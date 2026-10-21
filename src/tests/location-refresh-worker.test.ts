// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runLocationRefreshSchedule } from '../../workers/location-refresh/src/scheduled'
import type { MtrEnvironment } from '#lib/routing/mtr-refresh.js'
import { refreshLocations } from '#lib/locations/refresh.js'
import { refreshFeatureMtr } from '#lib/routing/mtr-refresh.js'

vi.mock('#lib/db/services/locationLocalRefresh.js', () => ({
  processLocalLocationChanges: vi.fn().mockResolvedValue('idle'),
}))
vi.mock('#lib/locations/refresh.js', () => ({ refreshLocations: vi.fn() }))
vi.mock('#lib/routing/mtr-refresh.js', () => ({ refreshFeatureMtr: vi.fn() }))
afterEach(() => vi.restoreAllMocks())
const event = '*/5 * * * *'
const source = { baseUrl: 'https://source.example', apiKey: 'fixture-source', fetch }
function environment() {
  const session = { primary: true }
  const withSession = vi.fn(() => session)
  return {
    session,
    withSession,
    env: {
      DB: { withSession },
      SAANSEOI_BASE_URL: 'https://source.example',
      SAANSEOI_API_KEY: 'fixture-source',
      ROUTING_TOKEN: 'fixture-routing',
      ROUTING_SERVICE: {},
    } as unknown as MtrEnvironment,
  }
}

describe('scheduled Locations refresh', () => {
  it('uses primary-session state and drains one routing job after the bounded step', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(refreshLocations).mockResolvedValue('assessed')
    vi.mocked(refreshFeatureMtr).mockResolvedValue('idle')
    const e = environment()
    await runLocationRefreshSchedule(event, e.env, source)
    expect(e.withSession).toHaveBeenCalledWith('first-primary')
    expect(refreshLocations).toHaveBeenCalledWith(
      e.session,
      expect.objectContaining({
        baseUrl: source.baseUrl,
        apiKey: 'fixture-source',
      }),
    )
    expect(refreshFeatureMtr).toHaveBeenCalledWith(e.env, undefined, 90000)
  })
  it('still wakes durable routing after refresh failure without exposing upstream errors', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(refreshLocations).mockRejectedValue(new Error('private source payload'))
    vi.mocked(refreshFeatureMtr).mockResolvedValue('idle')
    const e = environment()
    await expect(runLocationRefreshSchedule(event, e.env, source)).rejects.toThrow(
      'LOCATION_REFRESH_STEP_FAILED',
    )
    expect(refreshFeatureMtr).toHaveBeenCalledWith(e.env, undefined, 90000)
    expect(JSON.stringify(log.mock.calls)).not.toContain('private source payload')
  })
  it('does not fail a completed refresh when routing is temporarily unavailable', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(refreshLocations).mockResolvedValue('complete')
    vi.mocked(refreshFeatureMtr).mockRejectedValue(new Error('private routing payload'))
    await expect(
      runLocationRefreshSchedule(event, environment().env, source),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('Location routing deferred to durable MTR retry')
  })
  it('rejects an unexpected trigger before any database or routing work', async () => {
    vi.mocked(refreshLocations).mockClear()
    vi.mocked(refreshFeatureMtr).mockClear()
    const e = environment()
    await expect(
      runLocationRefreshSchedule('unexpected', e.env, source),
    ).rejects.toThrow('UNKNOWN_LOCATION_REFRESH_CRON')
    expect(e.withSession).not.toHaveBeenCalled()
    expect(refreshLocations).not.toHaveBeenCalled()
    expect(refreshFeatureMtr).not.toHaveBeenCalled()
  })
})
