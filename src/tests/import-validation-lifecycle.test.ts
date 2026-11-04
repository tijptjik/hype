// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// API
import { getUser } from '#lib/api/user.remote.js'
import { getLayers } from '#lib/api/layer.remote.js'
// SERVICES
import { validateUsers } from '#lib/client/services/import/users.js'
import { validateLayers } from '#lib/client/services/import/features/layer.js'

vi.mock('#lib/api/user.remote.js', () => ({ getUser: vi.fn(), searchUsers: vi.fn() }))
vi.mock('#lib/api/layer.remote.js', () => ({
  getLayers: vi.fn(),
  getLayer: vi.fn(),
  createLayer: vi.fn(),
}))
vi.mock('#lib/api/property.remote.js', () => ({ getProjectProperties: vi.fn() }))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it.each(['users', 'layers'])(
  'stops %s validation callbacks after pending lookup loses ownership',
  async kind => {
    let current = true
    let finish!: (value: unknown) => void
    const remote = new Promise(resolve => {
      finish = resolve
    })
    vi.mocked(getUser).mockReturnValue(remote as never)
    vi.mocked(getLayers).mockReturnValue(remote as never)
    const progress = vi.fn()
    const results = vi.fn()
    const columns = [
      {
        header: 'id',
        field: 'id',
        modelType: kind === 'users' ? 'User' : 'Layer',
        locale: 'None',
      },
    ] as never
    const pending =
      kind === 'users'
        ? validateUsers(
            columns,
            [['first'], ['second']],
            ['id'],
            progress,
            results,
            () => current,
          )
        : validateLayers(
            columns,
            [['first'], ['second']],
            ['id'],
            'project',
            'en',
            progress,
            results,
            () => current,
          )
    current = false
    finish({ data: kind === 'users' ? { id: 'first' } : [{ id: 'first' }] })
    expect(await pending).toEqual({ invalidCount: 0, results: [] })
    expect(progress).not.toHaveBeenCalled()
    expect(results).not.toHaveBeenCalled()
    expect(kind === 'users' ? getUser : getLayers).toHaveBeenCalledOnce()
  },
)

it('propagates catalogue failure without reporting missing layers or validation completion', async () => {
  vi.mocked(getLayers).mockRejectedValueOnce(new Error('catalogue unavailable'))
  const progress = vi.fn()
  const results = vi.fn()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(
      validateLayers(
        [{ header: 'id', field: 'id', modelType: 'Layer', locale: 'None' }] as never,
        [['first']],
        ['id'],
        'project',
        'en',
        progress,
        results,
      ),
    ).rejects.toThrow('catalogue unavailable')
    expect(progress).not.toHaveBeenCalled()
    expect(results).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
