<script lang="ts">
// BITS COMPONENTS
import { Avatar } from '$lib/bits/core'
// TYPES
import type { UserChipProps } from './user-chip.types'

let {
  name,
  subtitle = '',
  src = null,
  class: className = ''
}: UserChipProps = $props()
</script>

<div class={`bits-theme inline-flex items-center gap-3 ${className}`}>
  <Avatar name={name} {src} class="size-9 overflow-hidden rounded-full" />
  <div class="flex min-w-0 flex-col">
    <span class="truncate text-sm font-semibold text-foreground">{name}</span>
    {#if subtitle}
      <span class="truncate text-xs text-muted-foreground">{subtitle}</span>
    {/if}
  </div>
</div>
