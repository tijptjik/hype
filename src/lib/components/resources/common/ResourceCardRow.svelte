<script lang="ts" generics="T extends Resource">
// BITS
import { IndexCard } from '$lib/bits'
// SERVICES
import { getHashiconUrl } from '$lib/client/services/image'
// TYPES
import type { Resource, EntityWithOptionalImage } from '$lib/types'
import type { Snippet } from 'svelte'

let {
  entities,
  startingIndex,
  columnCount,
  cardWidth,
  card,
}: {
  entities: T[]
  startingIndex: number
  columnCount: number
  cardWidth: number
  card?: Snippet<[T, number]>
} = $props()
</script>

<div
  class="grid gap-4 overflow-visible px-2 py-2 first:pt-1"
  style="grid-template-columns: repeat({columnCount}, minmax(0, 1fr));"
>
  {#each entities as entity, columnIndex (entity.id)}
    {#if entity}
      <div class="transition-all duration-200">
        {#if card}
          {@render card(entity, startingIndex + columnIndex)}
        {:else}
          <IndexCard
            title={entity.id}
            description=""
            imageSrc={getHashiconUrl(entity.id)}
            imageAlt={entity.id}
            {cardWidth}
          />
        {/if}
      </div>
    {/if}
  {/each}
</div>
