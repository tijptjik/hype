<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// LOCAL
import { getFeatureCardLayout } from '../featureCard.layout'
import { getFeatureCardResponsiveWidth } from '../featureCard.utils'

interface Props {
  leftActions?: import('svelte').Snippet
  rightActions?: import('svelte').Snippet
  heightBudgetPx?: number | null
}

let { leftActions, rightActions, heightBudgetPx = null }: Props = $props()

const responsiveCtx = getResponsiveCtx()
const responsiveWidth = $derived(getFeatureCardResponsiveWidth(responsiveCtx))
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
    heightBudgetPx,
  }),
)
</script>

<div
  id="feature-card-actions"
  class={cx(
    'pointer-events-auto flex shrink-0 items-center justify-between gap-3 bg-black',
    layout.hasElevatedChrome ? 'min-h-11' : 'min-h-16',
    'px-[var(--feature-card-content-padding)]',
    layout.hasElevatedChrome ? 'py-0' : 'py-2',
  )}
>
  <div class="flex min-w-0 flex-1 items-center self-center">
    {#if leftActions}
      {@render leftActions()}
    {/if}
  </div>
  <div class="flex shrink-0 items-center self-center">
    {#if rightActions}
      {@render rightActions()}
    {/if}
  </div>
</div>
