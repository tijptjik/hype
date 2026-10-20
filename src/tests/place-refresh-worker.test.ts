// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPlaceRefreshSchedule } from '../../workers/place-refresh/src/scheduled'
import type { MtrEnvironment } from '#lib/routing/mtr-refresh.js'
import { refreshPlaces } from '#lib/places/refresh.js'
import { refreshPlaceSourceEvidence } from '#lib/places/sourceRefresh.js'
import { refreshFeatureMtr } from '#lib/routing/mtr-refresh.js'

vi.mock('#lib/places/sourceRefresh.js', () => ({
  refreshPlaceSourceEvidence: vi.fn(async () => 'idle'),
}))
vi.mock('#lib/places/refresh.js', () => ({ refreshPlaces: vi.fn() }))
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

describe('scheduled Places refresh', () => {
  it('uses primary-session state and drains one routing job after the bounded step', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(refreshPlaces).mockResolvedValue('assessed')
    vi.mocked(refreshFeatureMtr).mockResolvedValue('idle')
    const e = environment()
    await runPlaceRefreshSchedule(event, e.env, source)
    expect(e.withSession).toHaveBeenCalledWith('first-primary')
    expect(refreshPlaces).toHaveBeenCalledWith(
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
    vi.mocked(refreshPlaces).mockRejectedValue(new Error('private source payload'))
    vi.mocked(refreshFeatureMtr).mockResolvedValue('idle')
    const e = environment()
    await expect(runPlaceRefreshSchedule(event, e.env, source)).rejects.toThrow(
      'PLACE_REFRESH_STEP_FAILED',
    )
    expect(refreshFeatureMtr).toHaveBeenCalledWith(e.env, undefined, 90000)
    expect(refreshPlaceSourceEvidence).toHaveBeenCalledWith(e.session, source)
    expect(JSON.stringify(log.mock.calls)).not.toContain('private source payload')
  })
  it('does not fail a completed refresh when routing is temporarily unavailable', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(refreshPlaces).mockResolvedValue('complete')
    vi.mocked(refreshFeatureMtr).mockRejectedValue(new Error('private routing payload'))
    await expect(
      runPlaceRefreshSchedule(event, environment().env, source),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('Place routing deferred to durable MTR retry')
  })
  it('rejects an unexpected trigger before any database or routing work', async () => {
    vi.mocked(refreshPlaces).mockClear()
    vi.mocked(refreshFeatureMtr).mockClear()
    const e = environment()
    await expect(runPlaceRefreshSchedule('unexpected', e.env, source)).rejects.toThrow(
      'UNKNOWN_PLACE_REFRESH_CRON',
    )
    expect(e.withSession).not.toHaveBeenCalled()
    expect(refreshPlaces).not.toHaveBeenCalled()
    expect(refreshFeatureMtr).not.toHaveBeenCalled()
  })
})

it('keeps canonical completion and routing independent of publisher evidence failure', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(refreshPlaces).mockResolvedValue('complete')
  vi.mocked(refreshPlaceSourceEvidence).mockRejectedValueOnce(
    new Error('private source payload'),
  )
  vi.mocked(refreshFeatureMtr).mockResolvedValue('idle')
  const e = environment()
  await expect(runPlaceRefreshSchedule(event, e.env, source)).resolves.toBeUndefined()
  expect(refreshFeatureMtr).toHaveBeenCalledWith(e.env, undefined, 90000)
  expect(warn).toHaveBeenCalledWith('Place source evidence deferred to durable retry')
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private source payload')
})
