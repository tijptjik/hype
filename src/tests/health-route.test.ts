import { describe, expect, it } from 'vitest'
import { GET } from '../routes/api/health/+server'

describe('health diagnostics', () => {
  it('handles unauthenticated request locals without failing', async () => {
    const response = await GET({
      locals: { user: undefined, session: undefined, optional: null },
      platform: { env: { ENVIRONMENT: 'local', PUBLIC_SAMPLE_KEY: 'secret-value' } },
    } as unknown as Parameters<typeof GET>[0])
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.locals).toEqual([{ user: [] }, { session: [] }, { optional: [] }])
    expect(payload.vars.PUBLIC_SAMPLE_KEY).toBe('***')
  })

  it('reports unavailable bindings explicitly', async () => {
    await expect(
      GET({ locals: {}, platform: undefined } as unknown as Parameters<typeof GET>[0]),
    ).rejects.toMatchObject({ status: 503 })
  })
})
