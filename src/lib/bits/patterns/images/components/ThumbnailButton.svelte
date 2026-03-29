<script lang="ts">
import { cx } from '$lib/bits/utils'
import { m } from '$lib/i18n'
import type { ThumbnailButtonProps } from './imagePrimitives.types'
import ImageSurface from './ImageSurface.svelte'

let {
  item,
  fit = 'fit',
  size = 88,
  rounded = 'rounded-xl',
  isActive = false,
  isLoading = false,
  isBlurred = false,
  isGreyscale = false,
  onSelect,
  onHover,
  onLoad,
  onError,
}: ThumbnailButtonProps = $props()

const dimension = $derived(typeof size === 'number' ? `${size}px` : size)
const enableSourceTransition = $derived(
  Boolean(item.sourceFallbackSrc) && !item.status?.uploadStatus,
)
const thumbnailItem = $derived(
  item.thumbnailSrc
    ? {
        ...item,
        src: item.thumbnailSrc,
        sourceFallbackSrc: item.sourceFallbackSrc ?? item.thumbnailSrc,
        blurSrc: item.blurSrc ?? item.thumbnailSrc,
      }
    : item,
)
</script>

<button
  type="button"
  class={cx(
    'group relative shrink-0 overflow-hidden p-0 text-left transition duration-240',
    rounded,
    isActive ? 'ring-3 ring-primary' : '',
  )}
  style={`width: ${dimension}; height: ${dimension};`}
  onclick={() => onSelect?.(item)}
  onmouseenter={() => onHover?.(item)}
  aria-pressed={isActive}
  aria-label={item.alt ?? m.gallery__select_image()}
>
  <ImageSurface
    item={thumbnailItem}
    {fit}
    {isLoading}
    {enableSourceTransition}
    {isBlurred}
    {isGreyscale}
    {rounded}
    {onLoad}
    {onError}
  />
</button>
