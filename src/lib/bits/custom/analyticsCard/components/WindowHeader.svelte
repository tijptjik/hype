<script lang="ts">
import type { AnalyticsCardWindowHeaderProps } from '../analyticsCard.types'

let {
  leftLabel,
  rightLabel,
  class: className = '',
}: AnalyticsCardWindowHeaderProps = $props()
</script>

<header
  class={['rounded-[1.4rem] bg-panel px-3 pt-2 pb-3 text-center', className]
    .filter(Boolean)
    .join(' ')}
>
  <p class="text-foreground-alt text-[10px] font-semibold tracking-[0.24em] uppercase">
    {leftLabel}
  </p>
  <h2 class="text-foreground mt-1 text-3xl font-semibold tracking-[0.06em] uppercase">
    {rightLabel}
  </h2>
</header>
