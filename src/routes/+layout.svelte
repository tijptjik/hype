<script lang="ts">
// SVELTE
import { watch } from 'runed'
import { onMount } from 'svelte'
import { toast } from 'svelte-sonner'
// STORES
import { page } from '$app/state'
// QUERY
import type { QueryClient } from '@tanstack/svelte-query'
// BITS
import { cx } from '$lib/bits/utils'
// AUTH
import { signIn, useSession } from '$lib/auth/client'
import {
  bootstrapAnonymousSession,
  shouldBootstrapAnonymous,
} from '$lib/auth/bootstrap'
import {
  UPGRADE_ACCOUNT_EVENT,
  type UpgradeReason,
  toSafeReturnPath,
} from '$lib/auth/upgrade'
// I18N
import { getLocaleKey, m } from '$lib/i18n'
// CONTEXT
import { setAppCtx } from '$lib/context/app.svelte'
import { setPlaceCtx } from '$lib/context/place.svelte'
import { setResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import App from '$lib/bits/patterns/layout/app/App.svelte'
import UpgradeAccountDialog from '$lib/bits/patterns/auth/UpgradeAccountDialog.svelte'
// MAPLIBRE
import { ensureMapLibreStyles, loadMapLibre } from '$lib/map/maplibreAssets'
import { monkeyPatchMapLibre } from '$lib/map/maplibrePreload'
// STYLES
import '$lib/styles/app.css'
// TYPES
import type { LayoutData, LayoutProps } from './$types'
import type { SessionUser } from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import { MOBILE_MAX_WIDTH } from '$lib/constants'

// PROPS
let { children, data }: LayoutProps = $props()

// CONTEXT
const queryClient = $derived(
  (
    data as LayoutData & {
      queryClient: QueryClient
    }
  ).queryClient,
)

const session = useSession()
const responsive = setResponsiveCtx()
let hasMounted = false
let pendingAuthReinit: number | null = null
let bootstrapError = $state<string | null>(null)
let isUpgradeOpen = $state(false)
let upgradeReason = $state<UpgradeReason>('account')
let upgradeReturnTo = $state('/')

// Set AppCtx in context
const appCtx = setAppCtx(
  queryClient,
  setPlaceCtx(),
  $session.data?.user as SessionUser | null,
  responsive,
)

function clearPendingAuthReinit(): void {
  if (pendingAuthReinit !== null) {
    clearTimeout(pendingAuthReinit)
    pendingAuthReinit = null
  }
}

// Reinitialize the app context after an auth identity change, including logout.
function scheduleAuthReinit(user: SessionUser | null): void {
  clearPendingAuthReinit()

  pendingAuthReinit = window.setTimeout(() => {
    pendingAuthReinit = null
    appCtx.setUser(user)
    void appCtx.init(user?.id ?? null)
  }, 0)
}

// Keep hub context available for both app and admin route trees.
$effect(() => {
  const rootHub = (data as LayoutData).hub as HubOptsExtended | undefined
  if (rootHub) {
    appCtx.setHub(rootHub)
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
  appCtx.isMobile = windowWidth < MOBILE_MAX_WIDTH

  if (typeof window === 'undefined') {
    return
  }

  scheduleResponsiveSync()
})

// Load maplibre globally
async function initializeAuthenticatedApp(): Promise<void> {
  if (shouldBootstrapAnonymous(page.url.pathname)) {
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
  appCtx.setUser((currentUser as SessionUser | undefined) ?? null)
  await appCtx.init(currentUser?.id ?? null)
}

async function retryBootstrap(): Promise<void> {
  bootstrapError = null
  try {
    await initializeAuthenticatedApp()
  } catch (error) {
    bootstrapError = error instanceof Error ? error.message : 'Guest session failed'
  }
}

async function handleRequestedUpgrade(): Promise<void> {
  const requestedUpgrade = page.url.searchParams.get('upgrade')
  const currentUser = $session.data?.user
  if (!requestedUpgrade || (currentUser && currentUser.isAnonymous !== true)) return

  upgradeReason = requestedUpgrade === 'admin' ? 'admin' : 'account'
  upgradeReturnTo = toSafeReturnPath(page.url.searchParams.get('returnTo'))
  isUpgradeOpen = true

  const cleanUrl = new URL(page.url)
  cleanUrl.searchParams.delete('upgrade')
  cleanUrl.searchParams.delete('returnTo')
  await goto(`${cleanUrl.pathname}${cleanUrl.search}`, {
    replaceState: true,
    keepFocus: true,
    noScroll: true,
  })
}

onMount(() => {
  hasMounted = true

  const handleUpgradeRequest = (event: Event): void => {
    const detail = (event as CustomEvent<{ reason?: UpgradeReason; returnTo?: string }>)
      .detail
    upgradeReason = detail?.reason ?? 'account'
    upgradeReturnTo = toSafeReturnPath(detail?.returnTo)
    isUpgradeOpen = true
  }
  window.addEventListener(UPGRADE_ACCOUNT_EVENT, handleUpgradeRequest)

  void (async () => {
    if (!appCtx.isInitialised) {
      await retryBootstrap()
    }

    await handleRequestedUpgrade()

    scheduleResponsiveSync()
    window.visualViewport?.addEventListener('resize', scheduleResponsiveSync)
    window.visualViewport?.addEventListener('scroll', scheduleResponsiveSync)

    try {
      // To minimize the payload in Cloudflare, mapping dependencies load client-side.
      const [, maplibreSource] = await Promise.all([
        ensureMapLibreStyles(),
        loadMapLibre(),
      ])
      const maplibre = monkeyPatchMapLibre(maplibreSource)
      ;(globalThis as typeof globalThis & { maplibregl: typeof maplibre }).maplibregl =
        maplibre

      appCtx.maplibre = maplibre
      appCtx.isMaplibreLoaded = true
    } catch (error) {
      console.error('Failed to load maplibre', error)
    }
  })()

  return () => {
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

// Determine if we're in admin mode based on the route
const isAdminMode = $derived(page.route.id?.startsWith('/admin') ?? false)
const localeKey = $derived(getLocaleKey())
const isShelllessRoute = $derived(
  Boolean(
    page.route.id?.startsWith('/policy') || page.route.id?.startsWith('/account'),
  ),
)
const shelllessClass = $derived(
  cx(
    'bits-theme min-h-screen w-full overflow-y-auto bg-black',
    localeKey === 'zhHant' ? 'font-(--font-hant)' : '',
    localeKey === 'zhHans' ? 'font-(--font-hans)' : '',
  ),
)
let lastIsAdminMode = $state<boolean | null>(null)

// Handle keydown listeners based on admin mode
watch(
  () => isAdminMode,
  newIsAdminMode => {
    newIsAdminMode
      ? appCtx.unregisterKeydownHandlers()
      : appCtx.registerKeydownHandlers()
  },
)

// Reset shared resource state whenever navigation crosses the app/admin boundary.
watch(
  () => isAdminMode,
  newIsAdminMode => {
    if (!hasMounted) {
      lastIsAdminMode = newIsAdminMode
      return
    }

    if (lastIsAdminMode === null) {
      lastIsAdminMode = newIsAdminMode
      return
    }

    if (lastIsAdminMode === newIsAdminMode) {
      return
    }

    lastIsAdminMode = newIsAdminMode
    appCtx.resetSharedResourceCachesForSurfaceSwitch()

    if (!newIsAdminMode) {
      appCtx.restoreDefaultQueryMap()
      void appCtx.reloadAppSurfaceResources()
    }
  },
)

// Handle user session changes
watch(
  () => $session.data?.user,
  newUser => {
    if (!hasMounted) {
      return
    }

    // Only reinitialize if user actually changed (not just session refresh)
    const currentUserId = appCtx.user?.id
    const newUserId = newUser?.id

    if (newUser && newUserId !== currentUserId) {
      // User login or user changed
      const previousUser = appCtx.user
      if (
        previousUser &&
        'isAnonymous' in previousUser &&
        previousUser.isAnonymous === true &&
        newUser.isAnonymous !== true
      ) {
        toast.success(m.guest__upgrade_success())
      }
      scheduleAuthReinit(newUser as SessionUser)
    } else if (!newUser && currentUserId) {
      // Account logout immediately converges on a fresh guest session.
      void retryBootstrap()
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
    {queryClient}
    isReady={appCtx.isInitialised}
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
/>
