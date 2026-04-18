<script lang="ts">
// SVELTE
import { watch } from 'runed'
import { onMount } from 'svelte'
// STORES
import { page } from '$app/state'
// QUERY
import type { QueryClient } from '@tanstack/svelte-query'
// BITS
import { cx } from '$lib/bits/utils'
// AUTH
import { useSession } from '$lib/auth/client'
// I18N
import { getLocaleKey } from '$lib/i18n'
// CONTEXT
import { setAppCtx } from '$lib/context/app.svelte'
import { setPlaceCtx } from '$lib/context/place.svelte'
import { setResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import App from '$lib/bits/patterns/layout/app/App.svelte'
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
let pendingAuthReinit: ReturnType<typeof setTimeout> | null = null

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
onMount(async () => {
  hasMounted = true

  if (!appCtx.isInitialised) {
    const currentUser = $session.data?.user
    if (currentUser) {
      appCtx.setUser(currentUser as SessionUser)
      await appCtx.init(currentUser.id)
    } else {
      await appCtx.init(null)
    }
  }

  scheduleResponsiveSync()
  window.visualViewport?.addEventListener('resize', scheduleResponsiveSync)
  window.visualViewport?.addEventListener('scroll', scheduleResponsiveSync)

  try {
    // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they are heavy
    // and the max worker size in the free tier is 1 MB
    const [, maplibreSource] = await Promise.all([
      ensureMapLibreStyles(),
      loadMapLibre(),
    ])
    const maplibre = monkeyPatchMapLibre(maplibreSource)
    globalThis.maplibregl = maplibre

    // Store maplibre in the app context so components can access it
    appCtx.maplibre = maplibre
    appCtx.isMaplibreLoaded = true
  } catch (error) {
    console.error('Failed to load maplibre', error)
  }

  return () => {
    clearPendingAuthReinit()

    if (responsiveSyncFrame !== 0) {
      window.cancelAnimationFrame(responsiveSyncFrame)
      responsiveSyncFrame = 0
    }

    window.visualViewport?.removeEventListener('resize', scheduleResponsiveSync)
    window.visualViewport?.removeEventListener('scroll', scheduleResponsiveSync)
  }
})

// Determine if we're in admin mode based on the route
const isAdminMode = $derived(page.route.id?.startsWith('/admin') ?? false)
const localeKey = $derived(getLocaleKey())
const isShelllessRoute = $derived(page.route.id?.startsWith('/policy') ?? false)
const shelllessClass = $derived(
  cx(
    'bits-theme min-h-screen w-full overflow-y-auto bg-black',
    localeKey === 'zhHant' ? 'font-(--font-hant)' : '',
    localeKey === 'zhHans' ? 'font-(--font-hans)' : '',
  ),
)

// Handle keydown listeners based on admin mode
watch(
  () => isAdminMode,
  newIsAdminMode => {
    newIsAdminMode
      ? appCtx.unregisterKeydownHandlers()
      : appCtx.registerKeydownHandlers()
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
      scheduleAuthReinit(newUser as SessionUser)
    } else if (!newUser && currentUserId) {
      // User logout
      scheduleAuthReinit(null)
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
