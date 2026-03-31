<script lang="ts" generics="T extends { id: string }">
import type { Snippet } from 'svelte'

type ResourceCardRowProps<T extends { id: string }> = {
  entities: T[]
  startingIndex: number
  columnCount: number
  cardWidth: number
  card?: Snippet<[T, number]>
}

let { entities, startingIndex, columnCount, cardWidth, card }: ResourceCardRowProps<T> =
  $props()
</script>

<div
  class="bits-resource-index__card-row"
  style={`--bits-resource-index-columns: ${Math.max(1, columnCount)}; --bits-resource-index-card-width: ${Math.max(0, cardWidth)}px;`}
>
  {#each entities as entity, offset (entity.id)}
    <div class="bits-resource-index__card-cell">
      {#if card}
        {@render card(entity, startingIndex + offset)}
      {:else}
        <article class="bits-resource-index__fallback-card">
          <p class="bits-resource-index__fallback-title">{entity.id}</p>
        </article>
      {/if}
    </div>
  {/each}
</div>
