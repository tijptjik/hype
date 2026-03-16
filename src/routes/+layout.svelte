<script lang="ts">
// SVELTE
import { watch } from 'runed'
import { onMount } from 'svelte'
// STORES
import { page } from '$app/state'
// QUERY
import { QueryClientProvider } from '@tanstack/svelte-query'
import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools'
// AUTH
import { useSession } from '$lib/auth/client'
// I18N
import { getLocale, setLocale } from '$lib/i18n'
// CONTEXT
import { setAppCtx } from '$lib/context/app.svelte'
import { setPlaceCtx } from '$lib/context/place.svelte'
// BITS
import { Toaster } from '$lib/bits'
// LIB
import { loadScript } from '$lib'
// MAPLIBRE
import { monkeyPatchMapLibre } from '$lib/map/maplibrePreload'
// STYLES
import '$lib/styles/app.css'
// TYPES
import type { QueryClient } from '@tanstack/svelte-query'
import type { LayoutData, LayoutProps } from './$types'
import type { SessionUser } from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import { MOBILE_MAX_WIDTH } from '$lib'

// PROPS
let { children, data }: LayoutProps = $props()

// CONTEXT
const { queryClient } = data as LayoutData & {
  queryClient: QueryClient
}

const session = useSession()

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

// Update mobile state when window width changes
$effect(() => {
  appCtx.isMobile = windowWidth < MOBILE_MAX_WIDTH
})

// Load maplibre globally
onMount(async () => {
  try {
    // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they are heavy
    // and the max worker size in the free tier is 1 MB
    await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js')
    const maplibre = monkeyPatchMapLibre()
    globalThis.maplibregl = maplibre

    // Store maplibre in the app context so components can access it
    appCtx.maplibre = maplibre
    appCtx.isMaplibreLoaded = true
  } catch (error) {
    console.error('Failed to load maplibre:', error)
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
    // Ignore cases where session refreshed but user didn't change
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

<svelte:window bind:innerWidth={windowWidth} />

<svelte:head>
  <title>{title}</title>
  <meta property="og:site_name" content={site_name}>
  <meta property="og:type" content="article">
  <meta name="description" content={site_description}>
  <meta property="og:description" content={site_description}>
  <meta name="twitter:description" content={site_description}>
  <meta property="og:title" content={title}>
  <meta property="og:image" content={socialImage.image}>
  <meta property="og:image:width" content={socialImage.width}>
  <meta property="og:image:height" content={socialImage.height}>
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content={title}>
  <meta name="twitter:image" content={socialImage.image}>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link
    href="https://fonts.googleapis.com/css2?family=Geologica:wght,CRSV@100..900,0&family=IBM+Plex+Mono:wght@400;700&family=Merriweather:ital,opsz,wght@0,18..144,300..900;1,18..144,300..900&family=Tilt+Neon&display=swap"
    rel="stylesheet"
  >
  {#if getLocale() === 'zh-hant'}
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@100..900&display=swap"
      rel="stylesheet"
    >
  {:else if getLocale() === 'zh-hans'}
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&display=swap"
      rel="stylesheet"
    >
  {/if}
</svelte:head>

<QueryClientProvider client={queryClient}>
  <div
    class="flex h-lvh w-dvw flex-row overscroll-contain bg-black"
    class:font-hant={getLocale() === 'zh-hant'}
    class:font-hans={getLocale() === 'zh-hans'}
  >
    <Toaster />
    <svelte:boundary>
      <!-- @ts-expect-error SVELTE ASYNC -->
      {#snippet pending()}
        <div
          class="absolute inset-0 flex items-center justify-center overscroll-contain rounded-lg bg-base-300"
        >
          <div class="loading loading-ring loading-lg text-primary"></div>
        </div>
      {/snippet}
      {@render children()}
    </svelte:boundary>
  </div>
  <!-- TODO Prevent this from ever running in PRODUCTION (but it's OK on Preview) -->
  {#if data.PUBLIC_SVELTE_QUERY_DEVTOOLS === 'true'}
    <SvelteQueryDevtools />
  {/if}
</QueryClientProvider>
