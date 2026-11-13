<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'
let { class: className = '' }: { class?: string } = $props()
</script>

<!-- Small-size square @ mark: a single open spiral preserves a clear central counter. -->
<svg
  viewBox="0 0 20 20"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linejoin="miter"
  class={cx('block size-4 shrink-0', className)}
  aria-hidden="true"
>
  <path d="M17 17H3V3H17V13H7V7H12V13" />
</svg>
