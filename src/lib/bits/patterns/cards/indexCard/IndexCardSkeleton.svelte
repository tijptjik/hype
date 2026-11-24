<script lang="ts">
// COMPONENTS
import IndexCard from './IndexCard.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'

let { subtleImage = false }: { subtleImage?: boolean } = $props()
</script>

<!-- Keep the real 10:8 image ratio, text metrics, body padding and footer height. -->
<ContentSkeleton>
  <IndexCard title="Feature name" description="Feature address" imageSrc="" imageAlt="">
    {#snippet header()}
      <div class="bits-index-card__header">
        {#if subtleImage}
          <div
            class="bg-foreground/[0.03] absolute inset-0 motion-safe:animate-pulse"
          ></div>
        {:else}
          <Skeleton class="absolute inset-0 rounded-none" />
        {/if}
      </div>
    {/snippet}
  </IndexCard>
</ContentSkeleton>
