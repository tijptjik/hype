<script lang="ts">
import { OMNIBAR_WIDTH_CONTAINER_CLASSES } from '../omnibar.styles'
import type { OmnibarRootProps } from './omnibarPrimitives.types'

let {
  children,
  class: className = '',
  style = '',
  onkeydown,
}: OmnibarRootProps = $props()
</script>

<div class={className} {style} {onkeydown}>
  <div class={OMNIBAR_WIDTH_CONTAINER_CLASSES}>{@render children?.()}</div>
</div>
