<script lang="ts">
// COMPONENTS
import Maplet from '#lib/bits/patterns/maps/LazyMaplet.svelte'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
// PRESENTATION
import { coordinateChangeCamera } from '#lib/revisions/coordinateChange.js'
// TYPES
import type { RevisionDifference } from '#lib/revisions/diff.js'

let {
  change,
  coordinates,
  side,
}: {
  change: RevisionDifference
  coordinates: [number, number]
  side: 'before' | 'after'
} = $props()
const theme = getThemeModel()
let width = $state(0)
const camera = $derived(coordinateChangeCamera(change, width, 256))
</script>

<div class="border-border/50 overflow-hidden rounded-md border">
  <div
    bind:clientWidth={width}
    class="pointer-events-none relative h-64"
    role="img"
    aria-label={`${side === 'before' ? 'Previous' : 'Updated'} location map`}
  >
    {#if width > 0 && camera}
      {#key JSON.stringify([camera, coordinates])}
        <Maplet
          {coordinates}
          initialCenter={camera.center}
          initialZoom={camera.zoom}
          mapStyleCode={theme?.resolvedMapStyle}
          addressMeta={null}
          draggable={false}
          draggingLocked
        />
      {/key}
    {/if}
  </div>
  <p
    class="text-muted-foreground border-border/50 border-t px-3 py-2 text-xs break-words"
  >
    Longitude {coordinates[0]} · Latitude {coordinates[1]}
  </p>
</div>
