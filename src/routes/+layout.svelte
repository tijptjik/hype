<script lang="ts">
// SVELTE
import { watch } from 'runed'
import { onMount } from 'svelte'
// STORES
import { page } from '$app/state'
// QUERY
import type { QueryClient } from '@tanstack/svelte-query'
// AUTH
import { useSession } from '$lib/auth/client'
// I18N
import { getLocaleKey } from '$lib/i18n'
// CONTEXT
import { setAppCtx } from '$lib/context/app.svelte'
import { setPlaceCtx } from '$lib/context/place.svelte'
import { setResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import { App } from '$lib/bits'
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
const { queryClient } = data as LayoutData & {
  queryClient: QueryClient
}

const session = useSession()
const responsive = setResponsiveCtx()

// Set AppCtx in context
const appCtx = setAppCtx(
  queryClient,
  setPlaceCtx(),
  $session.data?.user as SessionUser | null,
)

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

// Update mobile state when window width changes
$effect(() => {
  appCtx.isMobile = windowWidth < MOBILE_MAX_WIDTH
  responsive.setWindowDimensions(windowWidth, windowHeight)
})

// Load maplibre globally
onMount(async () => {
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
})

// Initialize AppCtx if not already initialized
if (!appCtx.isInitialised) {
  const currentUser = $session.data?.user
  if (currentUser) {
    appCtx.setUser(currentUser as SessionUser)
    appCtx.init(currentUser.id)
  } else {
    appCtx.init(null)
  }
}

// Determine if we're in admin mode based on the route
const isAdminMode = $derived(page.route.id?.startsWith('/admin') ?? false)

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
    // Only reinitialize if user actually changed (not just session refresh)
    const currentUserId = appCtx.user?.id
    const newUserId = newUser?.id

    if (newUser && newUserId !== currentUserId) {
      // User login or user changed
      appCtx.setUser(newUser as unknown as SessionUser)
      appCtx.reinitializeWithAuth()
    } else if (!newUser && currentUserId) {
      // User logout
      appCtx.setUser(null)
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

<svelte:window bind:innerHeight={windowHeight} />

<App
  bind:windowWidth
  {queryClient}
  isReady={appCtx.isInitialised}
  localeKey={getLocaleKey()}
  {title}
  siteName={site_name}
  siteDescription={site_description}
  {socialImage}
>
  {@render children()}
</App>
