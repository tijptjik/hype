<script lang="ts">
// IMAGE PRESENTATION
import { getImageEdgeGaps, getImageEdgeInset } from '#lib/images/presentation.js'
import { useRimBounds } from '#lib/images/useRimBounds.svelte.js'
// TYPES
import type { ImageBackdropMode } from '#lib/images/presentation.js'

let {
  src,
  mode = 'blur',
  rotationDegrees = 0,
  class: className = '',
  blurClass = 'h-full w-full scale-[1.04] object-cover object-center blur-lg',
}: {
  src: string
  mode?: ImageBackdropMode
  rotationDegrees?: number
  class?: string
  blurClass?: string
} = $props()

// Grid aspect ratios produce fractional sizes; rounded client dimensions can leave
// the first or last painted row uncovered beside the full-height foreground.
let bounds = $state<DOMRectReadOnly>()
const width = $derived(bounds?.width ?? 0)
const height = $derived(bounds?.height ?? 0)
let sourceSize = $state({ src: '', width: 0, height: 0 })
const analysis = useRimBounds(() => (mode === 'edges' ? src : null))
const crop = $derived(analysis.bounds)
const visibleWidth = $derived(crop?.width ?? sourceSize.width)
const visibleHeight = $derived(crop?.height ?? sourceSize.height)
const quarterTurn = $derived(Math.abs(rotationDegrees % 180) === 90)
const rotatedWidth = $derived(quarterTurn ? height : width)
const rotatedHeight = $derived(quarterTurn ? width : height)
const gaps = $derived(
  getImageEdgeGaps(
    sourceSize.src === src ? visibleWidth : 0,
    sourceSize.src === src ? visibleHeight : 0,
    rotatedWidth,
    rotatedHeight,
  ),
)
// Successfully inspected images cast their exact visible edge; unreadable sources
// retain the earlier small sampling inset without changing their foreground.
const insetX = $derived(crop ? crop.x : getImageEdgeInset(sourceSize.width))
const insetY = $derived(crop ? crop.y : getImageEdgeInset(sourceSize.height))
const rightX = $derived(crop ? crop.x + crop.width - 1 : sourceSize.width - insetX - 1)
const bottomY = $derived(
  crop ? crop.y + crop.height - 1 : sourceSize.height - insetY - 1,
)
// SVG image boundaries can rasterize into a partly empty outer row/column.
// Bleed past the clipped container on the strip's long axis to keep it covered.
const EDGE_BLEED_PX = 1
</script>

{#snippet edgeSlice(
  viewBox: string,
  sliceWidth: number,
  sliceHeight: number,
  left: number,
  top: number,
)}
  <svg
    aria-hidden="true"
    class="absolute overflow-hidden"
    {viewBox}
    preserveAspectRatio="none"
    style:width={`${sliceWidth}px`}
    style:height={`${sliceHeight}px`}
    style:left={`${left}px`}
    style:top={`${top}px`}
  >
    <image href={src} width={sourceSize.width} height={sourceSize.height} />
  </svg>
{/snippet}

<div
  class={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
  aria-hidden="true"
>
  {#if mode === 'edges'}
    <!-- Only edge casting needs layout observation; blurred backdrops fill via CSS. -->
    <div class="absolute inset-0" bind:contentRect={bounds}></div>
    <!-- Detected rims are clipped consistently with the foreground. SVG viewports
         preserve alpha and reuse the browser's decoded source image. -->
    <div
      class="absolute top-1/2 left-1/2"
      style:width={`${rotatedWidth}px`}
      style:height={`${rotatedHeight}px`}
      style:transform={`translate(-50%, -50%) rotate(${rotationDegrees}deg)`}
    >
      {#if gaps.x > 0}
        {@render edgeSlice(
          `${insetX} ${crop?.y ?? 0} 1 ${visibleHeight}`,
          gaps.x + 0.5,
          rotatedHeight + EDGE_BLEED_PX * 2,
          0,
          -EDGE_BLEED_PX,
        )}
        {@render edgeSlice(
          `${rightX} ${crop?.y ?? 0} 1 ${visibleHeight}`,
          gaps.x + 0.5,
          rotatedHeight + EDGE_BLEED_PX * 2,
          rotatedWidth - gaps.x - 0.5,
          -EDGE_BLEED_PX,
        )}
      {/if}
      {#if gaps.y > 0}
        {@render edgeSlice(
          `${crop?.x ?? 0} ${insetY} ${visibleWidth} 1`,
          rotatedWidth + EDGE_BLEED_PX * 2,
          gaps.y + 0.5,
          -EDGE_BLEED_PX,
          0,
        )}
        {@render edgeSlice(
          `${crop?.x ?? 0} ${bottomY} ${visibleWidth} 1`,
          rotatedWidth + EDGE_BLEED_PX * 2,
          gaps.y + 0.5,
          -EDGE_BLEED_PX,
          rotatedHeight - gaps.y - 0.5,
        )}
      {/if}
    </div>
    {#key src}
      <img
        {src}
        alt=""
        class="pointer-events-none absolute size-px opacity-0"
        onload={event => {
          const image = event.currentTarget as HTMLImageElement
          sourceSize = { src, width: image.naturalWidth, height: image.naturalHeight }
        }}
      >
    {/key}
  {:else}
    <img {src} alt="" class={blurClass}>
  {/if}
</div>
