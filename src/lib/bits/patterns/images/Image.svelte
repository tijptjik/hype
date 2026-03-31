<script lang="ts">
import * as ImagePrimitive from './components'
import type { ImageProps } from './images.types'

let { item, fit = 'fit', isLoading = false }: ImageProps = $props()
</script>

<div class="h-full w-full">
  <ImagePrimitive.ImageSurface
    {item}
    {fit}
    {isLoading}
    class="h-full w-full"
    rounded="rounded-2xl"
  />
</div>
