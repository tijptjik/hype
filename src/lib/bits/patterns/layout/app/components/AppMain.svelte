<script lang="ts">
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import { cx } from '$lib/bits/utils'

type AppMainProps = {
  children: import('svelte').Snippet
  class?: string
  style?: string
}

let { children, class: className = '', style = '' }: AppMainProps = $props()

const responsiveCtx = getResponsiveCtx()
const menuReservedHeight = $derived(responsiveCtx.menuReservedHeight)
</script>

<main
  id="app-main"
  style={`--app-main-menu-reserved-height: ${menuReservedHeight}px;${style}`}
  class={cx(
    'relative z-40 flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden',
    'pb-(--app-main-menu-reserved-height)',
    'pointer-events-none',
    'transition-[padding] duration-260 ease-[ease]',
    className,
  )}
>
  {@render children()}
</main>
