// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
const setup = vi.hoisted(() => vi.fn())
vi.mock('#lib/api/index.js', () => ({ setupRequestHandler: setup }))
// ROUTE
import { load } from '../routes/admin/users/+page.server'

describe('user directory route', () => {
  it('checks fresh roles using the resolved platform before rendering', async () => {
    const platform = { env: { DB: {} } }
    const event = {
      locals: { platform, hub: { id: 'active' } },
      request: new Request('https://example.com/admin/users'),
    }
    setup.mockResolvedValue({
      user: { isAnonymous: false, superAdmin: false },
      userRoles: [{ type: 'hub', role: 'admin', hubId: 'active' }],
    })
    expect(await load(event as never)).toEqual({})
    expect(setup).toHaveBeenCalledWith({
      locals: event.locals,
      platform,
      request: event.request,
    })
  })
  it('rejects a direct URL request from an organisation owner', async () => {
    setup.mockResolvedValue({
      user: { isAnonymous: false, superAdmin: false },
      userRoles: [{ type: 'organisation', role: 'owner' }],
    })
    await expect(
      load({ locals: { hub: { id: 'active' } } } as never),
    ).rejects.toMatchObject({ status: 403 })
  })
})
