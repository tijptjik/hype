<script lang="ts">
// TYPES
import type { MainRootProps } from './main.types'

let { children, class: className = '', onDimensionsChange }: MainRootProps = $props()
const rootClass = $derived(['bits-main relative', className].filter(Boolean).join(' '))
let mainWidth = $state(0)
let mainHeight = $state(0)

$effect(() => {
  onDimensionsChange?.(mainWidth, mainHeight)
})
</script>

<main
  bind:clientWidth={mainWidth}
  bind:clientHeight={mainHeight}
  class={rootClass}
  data-responsive-main="true"
>
  {@render children?.()}
</main>
