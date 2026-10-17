<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
// SVELTEKIT
import { goto } from '$app/navigation'
import { page } from '$app/state'
// THIRD-PARTY
import { watch } from 'runed'
import { toast } from 'svelte-sonner'
// BITS
import { cx } from '#lib/bits/utils.js'
// AUTH
import { signIn, useSession } from '#lib/auth/client.js'
import { DEV_PERSONAS } from '#lib/auth/dev-personas.js'
import {
  bootstrapAnonymousSession,
  consumeSignOutIntent,
  isAuthEntryPath,
  shouldBootstrapAnonymous,
} from '#lib/auth/bootstrap.js'
// DEBUG
import { logMarkerBootstrap } from '#lib/debug/markerBootstrap.js'
import {
  UPGRADE_ACCOUNT_EVENT,
  isGuestUser,
  type UpgradeReason,
  toSafeReturnPath,
} from '#lib/auth/upgrade.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// API
// CONTEXT
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// BITS
import App from '#lib/bits/patterns/layout/app/App.svelte'
import UpgradeAccountDialog from '#lib/bits/patterns/auth/UpgradeAccountDialog.svelte'
// STYLES
import '#lib/styles/app.css'
// CONSTANTS
// TYPES
import type { LayoutData, LayoutProps } from './$types'
import type { SessionUser } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

// PROPS
let { children, data }: LayoutProps = $props()

// CONTEXT

const session = useSession()
const responsive = setResponsiveCtx()
let hasMounted = false
let isBootstrapping = false
let pendingAuthReinit: number | null = null
let bootstrapError = $state<string | null>(null)
let isUpgradeOpen = $state(false)
let upgradeReason = $state<UpgradeReason>('account')
let upgradeReturnTo = $state('/')

// Shared foundations are created once; surface layouts own resource mechanics.
setThemeModel()
const root = setRootCTX(responsive)

function clearPendingAuthReinit(): void {
  if (pendingAuthReinit !== null) {
    clearTimeout(pendingAuthReinit)
    pendingAuthReinit = null
  }
}

/** Rebuilds user-scoped application data after a confirmed authentication change. */
async function refreshAppForSessionUser(user: SessionUser): Promise<void> {
  clearPendingAuthReinit()
  root.sync(user, root.hub)
}

// Reinitialize the app context after an auth identity change, including logout.
function scheduleAuthReinit(user: SessionUser): void {
  clearPendingAuthReinit()

  pendingAuthReinit = window.setTimeout(() => {
    pendingAuthReinit = null
    void refreshAppForSessionUser(user)
  }, 0)
}

/** Waits until the shared session and application context both recognise an upgraded account. */
async function confirmAccountUpgrade(): Promise<void> {
  let user = $session.data?.user as SessionUser | undefined
  if (!user || isGuestUser(user)) {
    await $session.refetch()
    user = $session.data?.user as SessionUser | undefined
  }

  if (!user || isGuestUser(user)) {
    throw new Error('account promotion was not reflected in the session')
  }

  await refreshAppForSessionUser(user)
}

// Keep hub context available for both app and admin route trees.
$effect(() => {
  const rootHub = (data as LayoutData).hub as HubOptsExtended | undefined
  if (rootHub) {
    untrack(() => root.sync(root.user, rootHub))
  }
})

// Reactive window width binding
let windowWidth = $state(0)
let windowHeight = $state(0)
let responsiveSyncFrame = 0

// Coalesce viewport and window measurements so resize bursts only fan out once per frame.
const scheduleResponsiveSync = (): void => {
  if (responsiveSyncFrame !== 0) {
    return
  }

  responsiveSyncFrame = window.requestAnimationFrame(() => {
    responsiveSyncFrame = 0

    const visualViewport = window.visualViewport

    responsive.setWindowDimensions(windowWidth, windowHeight)

    if (!visualViewport) {
      responsive.setViewportDimensions(window.innerWidth, window.innerHeight)
      return
    }

    responsive.setViewportDimensions(
      visualViewport.width,
      visualViewport.height,
      visualViewport.offsetTop,
      visualViewport.offsetLeft,
    )
  })
}

// Update mobile state when window width changes
$effect(() => {
  if (typeof window === 'undefined') {
    return
  }

  scheduleResponsiveSync()
})

async function initializeAuthenticatedApp(): Promise<void> {
  logMarkerBootstrap('application bootstrap started', {
    pathname: page.url.pathname,
    hasSessionUser: Boolean($session.data?.user),
    isSessionPending: $session.isPending,
  })

  // Publish the server-resolved hub before surfaces start their own resource passes.
  const rootHub = (data as LayoutData).hub as HubOptsExtended | undefined
  if (rootHub)
    root.sync(($session.data?.user as SessionUser | undefined) ?? null, rootHub)

  // Component previews share identity foundations but do not need a guest account.
  const isStudio =
    page.url.pathname === '/themes' || page.url.pathname.startsWith('/themes/')
  if (!isStudio && shouldBootstrapAnonymous(page.url.pathname)) {
    await bootstrapAnonymousSession({
      getSession: () => ({
        isPending: $session.isPending,
        userId: $session.data?.user?.id,
      }),
      signInAnonymous: async () => {
        const result = await signIn.anonymous()
        if (result.error) throw new Error(result.error.message)
      },
      refetchSession: () => $session.refetch(),
    })
  }

  const currentUser = $session.data?.user
  root.sync((currentUser as SessionUser | undefined) ?? null, rootHub ?? null)
  root.ready = true
}

async function retryBootstrap(): Promise<void> {
  if (isBootstrapping) return
  isBootstrapping = true
  bootstrapError = null
  try {
    await initializeAuthenticatedApp()
  } catch (error) {
    bootstrapError = error instanceof Error ? error.message : 'Guest session failed'
  } finally {
    isBootstrapping = false
  }
}

async function handleRequestedUpgrade(): Promise<void> {
  const requestedUpgrade = page.url.searchParams.get('upgrade')
  const currentUser = $session.data?.user
  if (!requestedUpgrade || (currentUser && currentUser.isAnonymous !== true)) return

  upgradeReason = requestedUpgrade === 'admin' ? 'admin' : 'account'
  upgradeReturnTo = toSafeReturnPath(page.url.searchParams.get('returnTo'))
  isUpgradeOpen = true

  const cleanUrl = new URL(page.url.href)
  cleanUrl.searchParams.delete('upgrade')
  cleanUrl.searchParams.delete('returnTo')
  await goto(`${cleanUrl.pathname}${cleanUrl.search}`, {
    replace: true,
    reset: false,
  })
}

onMount(() => {
  // Shared lifecycle runs on every entry route; only the public surface loads map resources.
  hasMounted = true
  let disposed = false

  const handleUpgradeRequest = (event: Event): void => {
    const detail = (event as CustomEvent<{ reason?: UpgradeReason; returnTo?: string }>)
      .detail
    upgradeReason = detail?.reason ?? 'account'
    upgradeReturnTo = toSafeReturnPath(detail?.returnTo)
    isUpgradeOpen = true
  }
  window.addEventListener(UPGRADE_ACCOUNT_EVENT, handleUpgradeRequest)

  void (async () => {
    if (!root.ready) {
      await retryBootstrap()
    }

    await handleRequestedUpgrade()
    if (disposed) return

    scheduleResponsiveSync()
    window.visualViewport?.addEventListener('resize', scheduleResponsiveSync)
    window.visualViewport?.addEventListener('scroll', scheduleResponsiveSync)
  })()

  return () => {
    disposed = true
    clearPendingAuthReinit()

    if (responsiveSyncFrame !== 0) {
      window.cancelAnimationFrame(responsiveSyncFrame)
      responsiveSyncFrame = 0
    }

    window.visualViewport?.removeEventListener('resize', scheduleResponsiveSync)
    window.visualViewport?.removeEventListener('scroll', scheduleResponsiveSync)
    window.removeEventListener(UPGRADE_ACCOUNT_EVENT, handleUpgradeRequest)
  }
})

const localeKey = $derived(getLocaleKey())
const isShelllessRoute = $derived(
  Boolean(
    page.url.pathname === '/themes' ||
      page.url.pathname.startsWith('/themes/') ||
      page.route.id?.startsWith('/policy') ||
      page.route.id?.startsWith('/account'),
  ),
)
// Each surface renders its own pending state; shared metadata never waits for resource loading.
const isAppReady = true
const shelllessClass = $derived(
  cx(
    'bits-theme min-h-screen w-full overflow-y-auto bg-canvas text-base-content',
    localeKey === 'zhHant' ? 'font-(--font-hant)' : '',
    localeKey === 'zhHans' ? 'font-(--font-hans)' : '',
  ),
)
// A root mounted on policy/studio routes may later enter the public application.
watch(
  () => page.url.pathname,
  pathname => {
    const isStudio = pathname === '/themes' || pathname.startsWith('/themes/')
    if (
      hasMounted &&
      !isBootstrapping &&
      !root.user &&
      !isStudio &&
      shouldBootstrapAnonymous(pathname)
    ) {
      void retryBootstrap()
    }
  },
)

// Handle user session changes
watch(
  () => $session.data?.user,
  newUser => {
    logMarkerBootstrap('session watcher observed user', {
      hasSessionUser: Boolean(newUser),
      isAnonymous: newUser?.isAnonymous ?? null,
      hasMounted,
    })
    if (!hasMounted || isBootstrapping) {
      return
    }

    // Only reinitialize if user actually changed (not just session refresh)
    const currentUserId = root.user?.id
    const newUserId = newUser?.id

    const previousUser = root.user
    const isGuestPromotion =
      Boolean(previousUser && isGuestUser(previousUser)) &&
      newUser?.isAnonymous !== true

    if (newUser && (newUserId !== currentUserId || isGuestPromotion)) {
      // A promoted guest retains its ID, so treat its anonymous-state change as an auth change.
      if (isGuestPromotion) {
        toast.success(m.guest__upgrade_success())
      }
      scheduleAuthReinit(newUser as SessionUser)
    } else if (!newUser && currentUserId) {
      if (consumeSignOutIntent()) {
        // Let an explicit sign-out reach the sign-in page before another guest is created.
        root.sync(null, root.hub)
        logMarkerBootstrap('intentional sign-out suppressed automatic guest bootstrap')
        return
      }

      // Session expiry and other passive logout paths converge on a fresh guest session.
      root.sync(null, root.hub)
      void retryBootstrap()
    } else if (newUser) {
      // Role changes on the same account still invalidate incompatible resource scopes.
      root.sync(newUser as SessionUser, root.hub)
    }
  },
)

// Set Page Metadata
let title = $state(page.data.title)
let site_name = $state(page.data.site_name)
let site_description = $state(page.data.site_description)
let socialImage = {
  image: '/favicon.png',
  width: '200',
  height: '200',
}

watch(
  () => page.data,
  newData => {
    title = newData.title
    site_name = newData.site_name
    site_description = newData.site_description
  },
)
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

{#if isShelllessRoute}
  <div class={shelllessClass}>{@render children()}</div>
{:else}
  <App
    isReady={isAppReady}
    {localeKey}
    {title}
    siteName={site_name}
    siteDescription={site_description}
    {socialImage}
  >
    {@render children()}
  </App>
{/if}

{#if bootstrapError}
  <div
    class="fixed inset-0 z-[1100] flex items-center justify-center bg-black p-6 text-white"
  >
    <div class="max-w-sm text-center">
      <p>{m.bootstrap__error()}</p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-white px-4 py-2 text-black"
        onclick={retryBootstrap}
      >
        {m.bootstrap__retry()}
      </button>
    </div>
  </div>
{/if}

<UpgradeAccountDialog
  bind:open={isUpgradeOpen}
  reason={upgradeReason}
  returnTo={upgradeReturnTo}
  onAccountReady={confirmAccountUpgrade}
/>

{#if data.devPersona &&
  ($session.isPending || $session.data?.user?.id === DEV_PERSONAS[data.devPersona].id)}
  <div
    role="status"
    class="fixed bottom-2 left-2 z-[1200] rounded-md border border-amber-900 bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-950 shadow-lg"
  >
    Local development: {data.devPersona === 'admin' ? 'Admin' : 'Ordinary user'}
  </div>
{/if}
