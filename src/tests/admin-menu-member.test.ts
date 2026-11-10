// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SvelteMap } from 'svelte/reactivity'
import { tick } from 'svelte'
import type { SessionUser } from '#lib/types.js'

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  listCount: null as number | null,
  getTasks: vi.fn(),
  navigateOnAdmin: vi.fn(),
  togglePrism: vi.fn(),
  prisms: {
    organisation: [] as string[],
    project: [] as string[],
    layer: [] as string[],
  },
}))
vi.mock('#lib/api/tasks.remote.js', () => ({
  getTasks: state.getTasks,
}))
const taskRows = new SvelteMap<string, unknown[]>([['task', []]])
vi.mock('$app/state', () => ({
  page: { url: new URL('http://localhost/admin/features') },
}))
vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({
    filteredTasks: [],
    filteredFeatures: [],
    tasksQueryKey: ['task'],
    view: {
      get user() {
        return state.user
      },
      hub: { id: 'hub-a' },
      queries: {
        rows: {
          get task() {
            return taskRows.get('task')
          },
        },
      },
      filters: { viewFilters: { task: { isReviewed: false, type: null } } },
      scope: { prisms: state.prisms, togglePrism: state.togglePrism },
      resources: { queryMeta: { isAdminRequest: true, scope: 'test' } },
      getListQueryMeta: () =>
        state.listCount === null ? null : { totalCount: state.listCount },
      isSuperAdmin: () => Boolean(state.user?.superAdmin),
    },
  }),
}))
vi.mock('#lib/context/responsive.svelte.js', () => ({
  getResponsiveCtx: () => ({ isMobile: false }),
}))
vi.mock('#lib/navigation/index.js', () => ({ navigateOnAdmin: state.navigateOnAdmin }))
import AdminMenu from '#lib/bits/patterns/bars/adminMenu/AdminMenu.svelte'

beforeEach(() => {
  // jsdom has no scrolling API; the Docs entry makes the owner menu span pages.
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  state.getTasks.mockReset()
  state.navigateOnAdmin.mockReset()
  state.togglePrism.mockReset()
  state.prisms = { organisation: [], project: [], layer: [] }
  state.listCount = null
  taskRows.set('task', [])
})

describe('member admin navigation', () => {
  it.each([
    ['all available prisms', { organisation: [], project: [], layer: [] }],
    ['an explicit organisation', { organisation: ['org-a'], project: [], layer: [] }],
    ['an explicit project', { organisation: [], project: ['project-a'], layer: [] }],
    [
      'explicit layers',
      { organisation: [], project: [], layer: ['layer-a', 'layer-b'] },
    ],
  ])('opens Features without changing %s', async (_label, prisms) => {
    vi.useRealTimers()
    state.user = {
      id: 'member',
      isAnonymous: false,
      superAdmin: false,
      roles: [{ type: 'organisation', organisationId: 'org-a', role: 'member' }],
    } as SessionUser
    state.prisms = prisms
    const initialPrisms = structuredClone(prisms)
    // A leftover caller hint must never turn menu navigation into a layer selection.
    const props = { isNarrow: false, firstLayerId: 'first-sidebar-layer' }
    render(AdminMenu, props)

    await fireEvent.click(screen.getByRole('link', { name: 'Features' }))

    expect(state.navigateOnAdmin).toHaveBeenCalledTimes(1)
    expect(state.navigateOnAdmin).toHaveBeenCalledWith(expect.anything(), 'feature')
    expect(state.togglePrism).not.toHaveBeenCalled()
    expect(state.prisms).toEqual(initialPrisms)
  })

  it.each(['member', 'owner'] as const)(
    'shows permitted destinations for an organisation %s',
    role => {
      state.user = {
        id: 'member',
        isAnonymous: false,
        superAdmin: false,
        roles: [{ type: 'organisation', organisationId: 'org-a', role }],
      } as SessionUser
      state.getTasks.mockReturnValue({ current: { totalCount: 0 } })
      render(AdminMenu, { isNarrow: false })
      expect(screen.getByRole('link', { name: 'Features' })).toBeTruthy()
      expect(Boolean(screen.queryByRole('link', { name: 'Tasks' }))).toBe(
        role === 'owner',
      )
      expect(screen.queryByRole('link', { name: 'Hubs' })).toBeNull()
      const links = screen.getAllByRole('link')
      expect(links.at(-1)?.getAttribute('href')).toBe('/admin/docs')
      expect(links.at(-1)?.textContent).toContain('Docs')
    },
  )
})

it('loads a scoped server total before task rows have been loaded', () => {
  state.user = {
    id: 'owner',
    isAnonymous: false,
    superAdmin: false,
    roles: [{ type: 'organisation', organisationId: 'org-a', role: 'owner' }],
  } as SessionUser
  state.getTasks.mockReturnValue({ current: { data: [{ id: 'one' }], totalCount: 42 } })
  render(AdminMenu, { isNarrow: false })
  expect(screen.getByText('42')).toBeTruthy()
  expect(state.getTasks).toHaveBeenCalledWith(
    expect.objectContaining({
      pagination: { limit: 1, offset: 0 },
      conditions: { isReviewed: false, type: null },
      prisms: { organisation: [], project: [], layer: [] },
    }),
  )
})

it('ignores unscoped cached metadata in favour of the current account query', () => {
  state.user = {
    id: 'owner',
    isAnonymous: false,
    superAdmin: false,
    roles: [{ type: 'organisation', organisationId: 'org-a', role: 'owner' }],
  } as SessionUser
  state.getTasks.mockReturnValue({ current: { totalCount: 42 } })
  state.listCount = 41
  render(AdminMenu, { isNarrow: false })
  expect(screen.getByText('42')).toBeTruthy()
  expect(screen.queryByText('41')).toBeNull()
})

it('does not request task counts for a member without queue access', () => {
  state.user = {
    id: 'member',
    isAnonymous: false,
    superAdmin: false,
    roles: [{ type: 'organisation', organisationId: 'org-a', role: 'member' }],
  } as SessionUser
  render(AdminMenu, { isNarrow: false })
  expect(state.getTasks).not.toHaveBeenCalled()
})

it('refreshes the badge after queue rows change without duplicating the initial request', async () => {
  vi.useRealTimers()
  state.user = {
    id: 'owner',
    isAnonymous: false,
    superAdmin: false,
    roles: [{ type: 'organisation', organisationId: 'org-a', role: 'owner' }],
  } as SessionUser
  const refresh = vi.fn().mockResolvedValue(undefined)
  state.getTasks.mockReturnValue({ current: { totalCount: 42 }, refresh })
  render(AdminMenu, { isNarrow: false })
  await tick()
  expect(refresh).not.toHaveBeenCalled()
  taskRows.set('task', [{ id: 'reviewed-task' }])
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
})
