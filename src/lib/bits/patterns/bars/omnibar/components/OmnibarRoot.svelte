<script lang="ts">
import { getOmnibarWidthContainerClasses } from '../omnibar.styles'
import type { OmnibarRootProps } from './omnibarPrimitives.types'

let {
  children,
  class: className = '',
  hasElevatedChrome = false,
  style = '',
  onkeydown,
}: OmnibarRootProps = $props()

const widthContainerClasses = $derived(
  getOmnibarWidthContainerClasses(hasElevatedChrome),
)
</script>

<div class={className} {style} {onkeydown}>
  <div class={widthContainerClasses}>{@render children?.()}</div>
</div>
