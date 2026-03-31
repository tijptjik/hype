<script lang="ts">
import type { AnalyticsCardSkeletonBlockProps } from '../analyticsCard.types'

let { class: className = '', pill = false }: AnalyticsCardSkeletonBlockProps = $props()
</script>

<div
  class={[
    pill
      ? 'rounded-full border border-base-300 bg-[#121212] px-3 py-1.5 text-transparent'
      : 'bg-[#121212]',
    className,
  ]
    .filter(Boolean)
    .join(' ')}
  aria-hidden="true"
></div>
