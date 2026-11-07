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

<div class={className} {style} {onkeydown} data-app-intro-item="search">
  <div class={widthContainerClasses}>{@render children?.()}</div>
</div>
