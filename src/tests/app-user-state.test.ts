import { describe, expect, it, vi } from 'vitest'
// CONTEXT
import { AppCtx } from '$lib/context/app.svelte'
// TYPES
import type { QueryClient } from '@tanstack/svelte-query'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { CurrentUser } from '$lib/db/zod/schema/user.types'
import type { PlaceCtx } from '$lib/context/place.svelte'
import type { ResponsiveCtx } from '$lib/context/responsive.svelte'

describe('AppCtx user updates', () => {
  it('preserves active layers when updating the current user profile', async () => {
    const user = {
      id: 'user-1',
      username: 'before',
      userLayers: [
        {
          userId: 'user-1',
          hubId: 'hub-1',
          layerId: 'saved-layer',
          isDefaultVisible: true,
        },
      ],
    } as CurrentUser
    const appCtx = new AppCtx(
      { removeQueries: vi.fn() } as unknown as QueryClient,
      {} as PlaceCtx,
      user,
      {} as ResponsiveCtx,
    )

    appCtx.hub = { id: 'hub-1', code: 'test-hub' } as HubOptsExtended
    appCtx.state.resources.layer = [{ id: 'saved-layer' }] as Layer[]
    appCtx.state.prisms.layer = ['temporary-layer']

    await appCtx.setUser({ ...user, username: 'after' })

    expect(appCtx.state.prisms.layer).toEqual(['temporary-layer'])
  })
})
