<script lang="ts">
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// TYPES
import type { MainRootProps } from './main.types'

let { children, class: className = '' }: MainRootProps = $props()
const rootClass = $derived(['bits-main relative', className].filter(Boolean).join(' '))
const responsiveCtx = getResponsiveCtx()
</script>

<main
  bind:clientWidth={responsiveCtx.main.width}
  bind:clientHeight={responsiveCtx.main.height}
  class={rootClass}
  data-responsive-main="true"
>
  {@render children?.()}
</main>
