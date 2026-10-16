<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'
let { class: className = '' }: { class?: string } = $props()
</script>

<div
  aria-hidden="true"
  class={cx(
    'rounded bg-foreground/10 motion-safe:animate-pulse motion-reduce:animate-none',
    className,
  )}
></div>
