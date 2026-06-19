<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { ImportHeaderStatItem } from './importLayout.types'

let { label, value, tone = 'neutral' }: ImportHeaderStatItem = $props()

const valueClass = $derived(
  cx(
    'font-mono text-sm',
    tone === 'success' && 'text-success',
    tone === 'warning' && 'text-warning',
    tone === 'error' && 'text-error',
    tone === 'info' && 'text-info',
    tone === 'neutral' && 'text-base-content/80',
  ),
)
</script>

<div
  class="flex items-center gap-2 rounded-lg border border-base-content/10 bg-base-100/60 px-3 py-2"
>
  <span
    class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-base-content/55"
  >
    {label}
  </span>
  <span class={valueClass}>{value}</span>
</div>
