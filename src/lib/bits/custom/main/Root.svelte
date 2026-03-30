<script lang="ts">
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// TYPES
import type { MainRootProps } from './main.types'

let { children, class: className = '' }: MainRootProps = $props()
const rootClass = $derived(['bits-main relative', className].filter(Boolean).join(' '))
const responsiveCtx = getResponsiveCtx()
let mainWidth = $state(0)
let mainHeight = $state(0)

$effect(() => {
  responsiveCtx.setMainDimensions(mainWidth, mainHeight)
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
