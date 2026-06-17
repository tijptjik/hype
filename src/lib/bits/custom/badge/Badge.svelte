<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'

// TYPES
import type { BadgeProps } from './badge.types'

let { text, tone = 'neutral', class: className = '' }: BadgeProps = $props()

const badgeClasses = $derived(
  cx(
    'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]',
    tone === 'success' && 'border-success/30 bg-success/12 text-success',
    tone === 'warning' && 'border-warning/30 bg-warning/12 text-warning',
    tone === 'error' && 'border-error/30 bg-error/12 text-error',
    tone === 'neutral' &&
      'border-base-content/15 bg-base-content/5 text-base-content/70',
    className,
  ),
)
</script>

<span class={badgeClasses}>
  {text}
</span>
