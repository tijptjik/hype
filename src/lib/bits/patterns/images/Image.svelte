<script lang="ts">
import * as ImagePrimitive from './components'
import type { ImageProps } from './images.types'

let {
  src,
  alt,
  fit = 'fit',
  isLoading = false,
  class: className = '',
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

<div class={`h-full w-full ${className}`.trim()}>
  <ImagePrimitive.ImageSurface
    {item}
    {fit}
    {isLoading}
    class="h-full w-full"
    rounded="rounded-2xl"
  />
</div>
