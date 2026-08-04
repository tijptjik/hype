<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// MAP
import { startCircularFlight } from '$lib/client/services/geospatial'
// COMPONENTS
import AppLanding from './AppLanding.svelte'

let {
  children,
  class: className = '',
  flightTimeMs = 120000,
}: {
  children?: Snippet
  class?: string
  flightTimeMs?: number
} = $props()

const appCtx = getAppCtx()

$effect(() => {
  if (!appCtx.map) return
  return startCircularFlight(appCtx, [114.17276, 22.29191], 5, flightTimeMs)
})
</script>

<AppLanding
  class={`relative items-center justify-center bg-black/20 ${className}`}
  pixelRatio={1}
  antialias={false}
  interactive={false}
  showControls={false}
>
  {#if children}
    {@render children()}
  {/if}
</AppLanding>
