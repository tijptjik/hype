<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// LOCAL
import { getFeatureCardLayout } from '../featureCard.layout'
import { getFeatureCardResponsiveWidth } from '../featureCard.utils'

interface Props {
  topActions?: import('svelte').Snippet
  leftActions?: import('svelte').Snippet
  rightActions?: import('svelte').Snippet
  centerRightActionsOnMobile?: boolean
  heightBudgetPx?: number | null
}

let {
  topActions,
  leftActions,
  rightActions,
  centerRightActionsOnMobile = false,
  heightBudgetPx = null,
}: Props = $props()

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

<div class="pointer-events-auto shrink-0 bg-black">
  {#if topActions}
    <div class="flex justify-center px-[var(--feature-card-content-padding)] pt-2">
      {@render topActions()}
    </div>
  {/if}
  <div
    id="feature-card-actions"
    class={cx(
      responsiveCtx.isMobile
        ? 'grid grid-cols-[1fr_auto_1fr] items-center gap-3'
        : 'flex items-center justify-between gap-3',
      layout.hasElevatedChrome ? 'min-h-11' : 'min-h-16',
      'px-[var(--feature-card-content-padding)]',
      layout.hasElevatedChrome ? 'py-0' : 'py-2',
    )}
  >
    <div class="pointer-events-auto flex min-w-0 items-center self-center">
      {#if leftActions}
        {@render leftActions()}
      {/if}
    </div>
    {#if responsiveCtx.isMobile && !centerRightActionsOnMobile}
      <div
        class="pointer-events-none flex min-w-0 items-center justify-center self-center"
      ></div>
    {/if}
    <div
      class={cx(
        'pointer-events-auto flex min-w-0 items-center self-center',
        responsiveCtx.isMobile && centerRightActionsOnMobile
          ? 'justify-center'
          : 'justify-end',
      )}
    >
      {#if rightActions}
        {@render rightActions()}
      {/if}
    </div>
    {#if !responsiveCtx.isMobile || centerRightActionsOnMobile}
      <div
        class="pointer-events-none flex min-w-0 items-center justify-end self-center"
      ></div>
    {/if}
  </div>
</div>
