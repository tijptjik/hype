<script lang="ts">
// IMAGE PRESENTATION
import { useRimBounds } from '#lib/images/useRimBounds.svelte.js'
// TYPES
import type { HTMLImgAttributes } from 'svelte/elements'

let {
  src,
  alt = '',
  fit = 'fit',
  trimRim = false,
  class: className = '',
  style,
  ...attributes
}: HTMLImgAttributes & { fit?: 'fit' | 'cover'; trimRim?: boolean } = $props()

const analysis = useRimBounds(() => (trimRim && typeof src === 'string' ? src : null))
const crop = $derived(analysis.bounds)
const clipped = $derived(
  crop &&
    (crop.x > 0 ||
      crop.y > 0 ||
      crop.width < crop.sourceWidth ||
      crop.height < crop.sourceHeight),
)
</script>

<!-- Keep native load/error events and decode ownership with the existing viewer. -->
<img
  {...attributes}
  {src}
  {alt}
  class={className}
  style={clipped ? `${style ?? ''};visibility:hidden` : style}
  aria-hidden={clipped ? true : attributes['aria-hidden']}
  data-rim-bounds={crop
    ? `${crop.x},${crop.y},${crop.width},${crop.height}`
    : undefined}
>
{#if clipped && crop}
  <svg
    class={className}
    {style}
    role="img"
    aria-label={alt ?? ''}
    aria-hidden={attributes['aria-hidden']}
    viewBox={`0 0 ${crop.width} ${crop.height}`}
    preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
  >
    <title>{alt}</title>
    <svg
      aria-hidden="true"
      width={crop.width}
      height={crop.height}
      viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <image href={src} width={crop.sourceWidth} height={crop.sourceHeight} />
    </svg>
  </svg>
{/if}
