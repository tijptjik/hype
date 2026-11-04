// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta, mockedRemoteModule } from './remote-function-mock'

const mocks = vi.hoisted(() => ({ probe: vi.fn(), read: vi.fn(), authorize: vi.fn() }))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse: (value: unknown) => unknown },
    handler: (value: unknown, ctx: unknown) => Promise<unknown>,
  ) =>
    withRemoteMeta(
      async (value: unknown) =>
        handler(schema.parse(value), { db: {}, user: { id: 'u' }, userRoles: [] }),
      'query',
    ),
}))
vi.mock('#lib/db/services/layer.js', () => ({ probeLayerQuery: mocks.probe }))
vi.mock('#lib/db/services/layerLocationPolicy.js', () => ({
  getLayerRelocationSettings: mocks.read,
}))
vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeLayerUpdateForSubmission: mocks.authorize,
}))
import * as module from '#lib/api/layerLocationPolicy.remote.js'
const remote = mockedRemoteModule(module)

describe('Layer relocation settings read boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.probe.mockResolvedValue({
      id: 'l',
      projectId: 'p',
      organisationId: 'org',
      hubId: 'h',
    })
    mocks.authorize.mockReturnValue({ allowed: true })
    mocks.read.mockResolvedValue({
      policy: null,
      revision: 0,
      effectivePolicy: 'review',
    })
  })
  it('authorizes the persisted ancestry before returning settings', async () => {
    expect(await remote.getLayerRelocationPolicy({ layerId: 'l' })).toMatchObject({
      policy: null,
      effectivePolicy: 'review',
    })
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({ projectId: 'p', organisationId: 'org' }),
        submittedData: { relocationUpdatePolicy: true },
      }),
    )
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), 'l')
  })
  it('does not read settings for an unauthorized caller or missing Layer', async () => {
    mocks.authorize.mockReturnValue({ allowed: false, code: 'FIELD_FORBIDDEN' })
    await expect(
      remote.getLayerRelocationPolicy({ layerId: 'l' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.read).not.toHaveBeenCalled()
    mocks.probe.mockResolvedValue(null)
    await expect(
      remote.getLayerRelocationPolicy({ layerId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 })
  })
  it('rejects caller-controlled parent scope before probing', async () => {
    await expect(
      remote.getLayerRelocationPolicy({ layerId: 'l', projectId: 'other' } as never),
    ).rejects.toThrow()
    expect(mocks.probe).not.toHaveBeenCalled()
  })
})
