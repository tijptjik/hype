<script lang="ts">
import { cx } from '$lib/bits/utils'
import type { AnalyticsCardEmptyStateProps } from '../analyticsCard.types'

let {
  title,
  description,
  tone = 'neutral',
  class: className = '',
}: AnalyticsCardEmptyStateProps = $props()

const toneClass = $derived.by(() => {
  if (tone === 'error') {
    return 'border-error/30 bg-black'
  }

  if (tone === 'warning') {
    return 'border-warning/30 bg-black'
  }

  if (tone === 'subtle') {
    return 'border-dashed border-base-300 bg-[#121212]'
  }

  return 'border-base-300 bg-[#121212]'
})
</script>

<div class={cx('rounded-[1.25rem] border px-5 py-8 text-center', toneClass, className)}>
  <p class="text-sm font-semibold text-foreground">{title}</p>
  <p class="mt-2 text-sm leading-6 text-foreground-alt">{description}</p>
</div>
