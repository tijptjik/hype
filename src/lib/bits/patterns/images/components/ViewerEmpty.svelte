<script lang="ts">
import ImageIcon from 'virtual:icons/proicons/photo'
import type { EmptyStateProps } from './imagePrimitives.types'

let { title, description }: EmptyStateProps = $props()
</script>

<div
  class="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-base-100 p-6 text-center"
>
  <ImageIcon class="h-8 w-8 text-muted-foreground" />
  <div class="space-y-1">
    <p class="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {title}
    </p>
    {#if description}
      <p class="text-sm text-muted-foreground">{description}</p>
    {/if}
  </div>
</div>
