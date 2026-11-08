<script lang="ts">
import ImageIcon from 'virtual:icons/proicons/photo'
import type { EmptyStateProps } from './imagePrimitives.types'

let { title, description }: EmptyStateProps = $props()
</script>

<div
  class="border-border bg-base-100 flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-6 text-center"
>
  <ImageIcon class="text-muted-foreground h-8 w-8" />
  <div class="space-y-1">
    <p class="text-muted-foreground text-sm font-semibold tracking-[0.18em] uppercase">
      {title}
    </p>
    {#if description}
      <p class="text-muted-foreground text-sm">{description}</p>
    {/if}
  </div>
</div>
