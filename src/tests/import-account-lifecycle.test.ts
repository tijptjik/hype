// @vitest-environment jsdom
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/svelte/pure'
// SVELTE
import { flushSync } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// ROUTE
import ImportPage from '../routes/admin/import/+page.svelte'

const mocks = vi.hoisted(() => ({ view: null as unknown, ctx: null as unknown }))
vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({ setFacet: vi.fn(), setResourceType: vi.fn() }),
}))
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => mocks.view,
}))
vi.mock('#lib/context/header.svelte.js', () => ({
  getHeaderCtrl: () => ({
    setHeaderForIndex: vi.fn(),
    clearControlBar: vi.fn(),
    clearFooter: vi.fn(),
  }),
}))
vi.mock('#lib/context/import.svelte.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  setImportCtx: () => {},
  getImportCtx: () => mocks.ctx,
}))
vi.mock('#lib/bits/custom/main/index.js', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { Root: Component, Content: Component }
})
vi.mock(
  '#lib/bits/patterns/import/Dropzones.svelte',
  () => import('./mocks/svelte-component.svelte'),
)
vi.mock(
  '#lib/bits/patterns/import/ImportFeatureFlow.svelte',
  () => import('./mocks/svelte-component.svelte'),
)
vi.mock(
  '#lib/bits/patterns/import/ImportImageFlow.svelte',
  () => import('./mocks/svelte-component.svelte'),
)
afterEach(cleanup)

it('resets retained import state on account/role scope changes and on unmount', async () => {
  vi.useRealTimers()
  const scope = new SvelteMap([['key', 'account-a:admin']])
  const ctx = new ImportCtx()
  mocks.ctx = ctx
  mocks.view = { getRoleScopeQueryKey: () => scope.get('key') }
  const mounted = render(ImportPage)
  flushSync()
  ctx.setData([['Private draft']])
  ctx.setRowEnrichedData(0, { private: true })
  scope.set('key', 'account-b:admin')
  flushSync()
  expect(ctx.getData()).toEqual([])
  expect(ctx.getRowEnrichedData(0)).toBeUndefined()
  ctx.setData([['Second draft']])
  scope.set('key', 'account-b:reduced-role')
  flushSync()
  expect(ctx.getData()).toEqual([])
  ctx.setData([['Final draft']])
  await mounted.unmount()
  expect(ctx.getData()).toEqual([])
})
