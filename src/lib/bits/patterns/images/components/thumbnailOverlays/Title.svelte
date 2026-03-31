<script lang="ts">
import { cx } from '$lib/bits/utils'

let {
  text,
  class: className = '',
}: {
  text: string
  class?: string
} = $props()
</script>

<div
  class={cx('text-[11px] font-semibold uppercase tracking-[0.2em] text-white/92', className)}
>
  {text}
</div>
