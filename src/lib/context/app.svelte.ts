// SVELTE
import { getContext, setContext } from 'svelte'
// CONTEXT
import { ResourceViewCtx as AppCtx } from './resourceView.svelte.js'
// TYPES
import type { DivisionCtx } from './division.svelte.js'
import type { ResponsiveCtx } from './responsive.svelte.js'
import type { SessionUser } from '#lib/types.js'

export { AppCtx }

export const APPCTX_KEY = Symbol('mapContext')
let appCtxSingleton: AppCtx | null = null

export const setAppCtx = (
  divisionCtx: DivisionCtx,
  user: SessionUser | null,
  responsiveCtx: ResponsiveCtx,
) => {
  const context = new AppCtx(divisionCtx, user, responsiveCtx)
  appCtxSingleton = context
  // Don't initialize immediately - let the session watcher handle it after mount
  return setContext(APPCTX_KEY, context)
}

export const getAppCtx = (): ReturnType<typeof setAppCtx> => {
  const ctx = getContext<ReturnType<typeof setAppCtx> | undefined>(APPCTX_KEY)
  if (ctx) return ctx

  if (appCtxSingleton) {
    return appCtxSingleton as ReturnType<typeof setAppCtx>
  }

  throw new Error(
    'AppCtx context is missing. Ensure setAppCtx() is called in the root layout before using getAppCtx().',
  )
}
