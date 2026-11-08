<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import type { AnalyticsCardEmptyStateProps } from '../analyticsCard.types'

let {
  title,
  description,
  tone = 'neutral',
  class: className = '',
}: AnalyticsCardEmptyStateProps = $props()

const toneClass = $derived.by(() => {
  if (tone === 'error') {
    return 'border-error/30 bg-panel'
  }

  if (tone === 'warning') {
    return 'border-warning/30 bg-panel'
  }

  if (tone === 'subtle') {
    return 'border-dashed border-border bg-raised'
  }

  return 'border-border bg-raised'
})
</script>

<div class={cx('rounded-[1.25rem] border px-5 py-8 text-center', toneClass, className)}>
  <p class="text-foreground text-sm font-semibold">{title}</p>
  <p class="text-foreground-alt mt-2 text-sm leading-6">{description}</p>
</div>
