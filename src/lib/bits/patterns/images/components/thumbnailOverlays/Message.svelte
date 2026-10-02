<script lang="ts">
import { cx } from '#lib/bits/utils.js'

let {
  text,
  class: className = '',
}: {
  text: string
  class?: string
} = $props()
</script>

<p class={cx('text-xs text-white/62', className)}>{text}</p>
