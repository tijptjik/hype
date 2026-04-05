<script lang="ts">
// MAPS
import MapCanvas from '$lib/bits/patterns/maps/MapCanvas.svelte'
// BITS
import { cx } from '$lib/bits/utils'

type AppLandingProps = {
  children: import('svelte').Snippet
  mapStyleCode?: string
  class?: string
  style?: string
}

let {
  children,
  mapStyleCode = 'ghostery',
  class: className = '',
  style = '',
}: AppLandingProps = $props()
</script>

<main
  class={cx('top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden', className)}
  {style}
>
  {@render children()}
  <MapCanvas {mapStyleCode} />
</main>
