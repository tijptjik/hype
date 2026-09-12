<script lang="ts">
import { flip } from 'svelte/animate'
import type { Snippet } from 'svelte'
import ResourceContainer from '$lib/bits/patterns/panels/components/common/ResourceContainer.svelte'

type ManagedItem = {
  id: string
}

type Props = {
  items: ManagedItem[]
  item: Snippet<[ManagedItem]>
  flipDurationMs?: number
}

let { items, item, flipDurationMs = 150 }: Props = $props()
</script>

<ResourceContainer>
  {#each items as managedItem (managedItem.id)}
    <div animate:flip={{ duration: flipDurationMs }}>{@render item(managedItem)}</div>
  {/each}
</ResourceContainer>
