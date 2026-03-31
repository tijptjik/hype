<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'

type Props = {
  children: Snippet
  iconVerticalPaddingClass: string
  focusVisibleClass: string
  isNarrow: boolean
}

let { iconVerticalPaddingClass, focusVisibleClass, isNarrow, children }: Props =
  $props()
</script>

<div
  class="bits-theme group bits-panel-section-header-root {iconVerticalPaddingClass} {focusVisibleClass}"
  class:bits-panel-section-header-root--narrow={isNarrow}
>
  {@render children()}
</div>
