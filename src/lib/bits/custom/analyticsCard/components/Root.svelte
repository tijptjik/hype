<script lang="ts">
import type { AnalyticsCardRootProps } from '../analyticsCard.types'

let { class: className = '', children }: AnalyticsCardRootProps = $props()
</script>

<section
  class={[
    'rounded-xl border border-[#121212] bg-black px-5 py-5 sm:px-6 sm:py-6',
    className,
  ]
    .filter(Boolean)
    .join(' ')}
>
  {@render children?.()}
</section>
