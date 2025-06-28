<script lang="ts" generics="T extends Resource">
// COMPONENTS
import EntityCard from '$lib/components/resources/EntityCard.svelte';
// TYPES
import type { Resource, EntityWithOptionalImage } from '$lib/types';
import type { Snippet } from 'svelte';

let {
  entities,
  startingIndex,
  columnCount,
  card
}: {
  entities: T[];
  startingIndex: number;
  columnCount: number;
  card?: Snippet<[T, number]>;
} = $props();
</script>

<div
  class="grid gap-4 overflow-visible px-2 py-2 first:pt-1"
  style="grid-template-columns: repeat({columnCount}, minmax(0, 1fr));">
  {#each entities as entity, columnIndex (entity.id)}
    {#if entity}
      <div class="transition-all duration-200 hover:scale-[1.01]">
        {#if card}
          {@render card(entity, startingIndex + columnIndex)}
        {:else}
          <EntityCard
            entity={entity as EntityWithOptionalImage}
            keyMap={{ id: 'id', title: 'id', image: '' }} />
        {/if}
      </div>
    {/if}
  {/each}
</div>
