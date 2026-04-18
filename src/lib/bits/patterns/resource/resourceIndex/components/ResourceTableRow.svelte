<script lang="ts" generics="T extends { id: string }">
import type { Snippet } from 'svelte'

type ResourceTableRowProps<T extends { id: string }> = {
  entity: T
  index: number
  row?: Snippet<[T, number]>
}

let { entity, index, row }: ResourceTableRowProps<T> = $props()
</script>

<div class="px-2">
  {#if row}
    {@render row(entity, index)}
  {:else}
    <div class="bits-resource-index__fallback-row" data-entity-index={index}>
      <span class="bits-resource-index__fallback-title">{entity.id}</span>
    </div>
  {/if}
</div>
