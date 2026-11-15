<script lang="ts">
import * as ImagePrimitive from './components'
import type { ImageProps } from './images.types'

let {
  src,
  onError,
  alt,
  fit = 'fit',
  presentationMode,
  isLoading = false,
  class: className = '',
  rounded = 'rounded-2xl',
  showBackdrop = true,
  transparentBackground = false,
  enableSourceTransition = true,
  revealOnLoad = false,
}: ImageProps = $props()

const item = $derived(
  src
    ? {
        id: src,
        src,
        alt,
        presentationMode,
      }
    : null,
)
</script>

<div class={className}>
  <ImagePrimitive.ImageSurface
    {item}
    {onError}
    {fit}
    {isLoading}
    {rounded}
    {showBackdrop}
    {enableSourceTransition}
    {revealOnLoad}
    class={transparentBackground ? 'h-full w-full bg-transparent!' : 'h-full w-full'}
  />
</div>
