<script lang="ts" generics="T extends Resource">
import { setContext } from 'svelte'
// BITS
import { EntityCard } from '$lib/bits'
import { ENTITY_CARD_WIDTH_CONTEXT } from '$lib/bits/patterns/cards/entityCard/entityCard.context'
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

const cardLayout = $state({ width: cardWidth })

$effect(() => {
  cardLayout.width = cardWidth
})

setContext(ENTITY_CARD_WIDTH_CONTEXT, cardLayout)
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
          <EntityCard
            entity={entity as EntityWithOptionalImage}
            keyMap={{ id: 'id', title: 'id', image: '' }}
          />
        {/if}
      </div>
    {/if}
  {/each}
</div>
