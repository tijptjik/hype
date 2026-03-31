<script lang="ts">
import type { Component } from 'svelte'

import { cx } from '$lib/bits/utils'

let {
  iconComponent: IconComponent,
  class: className = '',
  iconClass = '',
}: {
  iconComponent: Component
  class?: string
  iconClass?: string
} = $props()
</script>

<div
  class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[inherit] bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.34)_100%)] backdrop-blur-[1.5px] [isolation:isolate]"
>
  <span
    class={cx(
      'flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-black/52 text-white shadow-[0_14px_34px_rgba(0,0,0,0.28)]',
      className,
    )}
  >
    <IconComponent class={cx('h-5 w-5', iconClass)} />
  </span>
</div>
