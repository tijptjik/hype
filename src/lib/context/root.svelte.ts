// SVELTE
import { getContext, setContext } from 'svelte'
// CONTEXT
import { AccountState } from './account.svelte.js'
import { CacheCtx } from './cache.svelte.js'
// TYPES
import type { SessionUser } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { ResponsiveCtx } from './responsive.svelte.js'

/** Shared route identity and resource lifetime; contains no surface bootstrap. */
export class RootCTX {
  readonly cacheCtx = new CacheCtx(undefined, true)
  readonly account = new AccountState()

  /** Authoritative session identity shared by route surfaces. @returns The root session user. */
  get user(): Readonly<SessionUser> | null {
    return this.account.session
  }
  hub: HubOptsExtended | null = $state.raw(null)
  ready = $state(false)
  private identity = ''

  constructor(readonly responsive: ResponsiveCtx) {}

  /**
   * Publishes identity before surfaces fetch data and supersedes incompatible cache reads.
   * @param user Authenticated or anonymous session identity.
   * @param hub Server-resolved hub metadata.
   * @returns Nothing.
   */
  sync(user: SessionUser | null, hub: HubOptsExtended | null): void {
    const identity = JSON.stringify([
      user?.id,
      user?.isAnonymous,
      user && 'roles' in user ? user.roles : [],
      user && 'superAdmin' in user ? user.superAdmin : false,
      hub?.id ?? hub?.code,
    ])
    if (identity !== this.identity) {
      this.cacheCtx.clear()
      this.identity = identity
    }
    this.account.syncSession(user)
    if (JSON.stringify(this.hub) !== JSON.stringify(hub)) this.hub = hub
  }
}

const ROOT_CONTEXT_KEY = Symbol('root-context')

/** Provides shared state for one rendered application. @param responsive Viewport state. @returns The new root. */
export function setRootCTX(responsive: ResponsiveCtx): RootCTX {
  return setContext(ROOT_CONTEXT_KEY, new RootCTX(responsive))
}

/** Resolves the current root without SSR-global state. @returns The layout-owned root. */
export function getRootCTX(): RootCTX {
  const root = getContext<RootCTX | undefined>(ROOT_CONTEXT_KEY)
  if (!root) throw new Error('RootCTX is missing from the root layout')
  return root
}
