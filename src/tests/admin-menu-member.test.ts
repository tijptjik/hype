// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '#lib/types.js'

const state = vi.hoisted(() => ({ user: null as SessionUser | null }))
vi.mock('$app/state', () => ({
  page: { url: new URL('http://localhost/admin/features') },
}))
vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({
    filteredTasks: [],
    filteredFeatures: [],
    view: {
      get user() {
        return state.user
      },
      hub: { id: 'hub-a' },
      isSuperAdmin: () => Boolean(state.user?.superAdmin),
    },
  }),
}))
vi.mock('#lib/context/responsive.svelte.js', () => ({
  getResponsiveCtx: () => ({ isMobile: false }),
}))
vi.mock('#lib/navigation/index.js', () => ({ navigateOnAdmin: vi.fn() }))
import AdminMenu from '#lib/bits/patterns/bars/adminMenu/AdminMenu.svelte'

afterEach(cleanup)

describe('member admin navigation', () => {
  it.each(['member', 'owner'] as const)(
    'shows permitted destinations for an organisation %s',
    role => {
      state.user = {
        id: 'member',
        isAnonymous: false,
        superAdmin: false,
        roles: [{ type: 'organisation', organisationId: 'org-a', role }],
      } as SessionUser
      render(AdminMenu, { isNarrow: false })
      expect(screen.getByRole('link', { name: 'Features' })).toBeTruthy()
      expect(Boolean(screen.queryByRole('link', { name: 'Tasks' }))).toBe(
        role === 'owner',
      )
      expect(screen.queryByRole('link', { name: 'Hubs' })).toBeNull()
    },
  )
})
