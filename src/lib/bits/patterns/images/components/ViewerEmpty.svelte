<script lang="ts">
import ImageIcon from 'virtual:icons/lucide/image'
import type { EmptyStateProps } from './imagePrimitives.types'

let { title, description }: EmptyStateProps = $props()
</script>

<div
  class="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/10 bg-black/5 p-6 text-center"
>
  <ImageIcon class="h-8 w-8 text-black/40" />
  <div class="space-y-1">
    <p class="text-sm font-semibold uppercase tracking-[0.18em] text-black/60">
      {title}
    </p>
    {#if description}
      <p class="text-sm text-black/50">{description}</p>
    {/if}
  </div>
</div>
