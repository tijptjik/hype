<script lang="ts">
import * as ImagePrimitive from './components'
import type { ImageProps } from './images.types'

let {
  src,
  alt,
  fit = 'fit',
  isLoading = false,
  class: className = '',
  rounded = 'rounded-2xl',
  showBackdrop = true,
  enableSourceTransition = true,
  revealOnLoad = false,
}: ImageProps = $props()

const item = $derived(
  src
    ? {
        id: src,
        src,
        alt,
      }
    : null,
)
</script>

<div class={className}>
  <ImagePrimitive.ImageSurface
    {item}
    {fit}
    {isLoading}
    {rounded}
    {showBackdrop}
    {enableSourceTransition}
    {revealOnLoad}
    class="h-full w-full"
  />
</div>
