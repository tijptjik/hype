<script lang="ts">
import * as ImagePrimitive from './components'
import type { ThumbnailProps } from './images.types'

let {
  item,
  fit = 'fit',
  size = 88,
  isActive = false,
  isLoading = false,
  onSelect,
  onLoad,
  onError,
}: ThumbnailProps = $props()
</script>

<ImagePrimitive.ThumbnailButton
  {item}
  {fit}
  {size}
  {isActive}
  {isLoading}
  {onSelect}
  {onLoad}
  {onError}
/>
