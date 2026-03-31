<script lang="ts">
import type { AnalyticsCardWindowHeaderProps } from '../analyticsCard.types'

let {
  leftLabel,
  rightLabel,
  class: className = '',
}: AnalyticsCardWindowHeaderProps = $props()
</script>

<header
  class={[
    'rounded-[1.4rem] bg-black px-3 pt-2 pb-3 text-center',
    className,
  ]
    .filter(Boolean)
    .join(' ')}
>
  <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground-alt">
    {leftLabel}
  </p>
  <h2 class="mt-1 text-3xl font-semibold uppercase tracking-[0.06em] text-foreground">
    {rightLabel}
  </h2>
</header>
