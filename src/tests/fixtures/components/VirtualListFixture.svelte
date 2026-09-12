<script lang="ts">
import VirtualResourceList from '$lib/bits/custom/resources/VirtualResourceList.svelte'
let { items }: { items: { id: string; name: string }[] } = $props()
</script>
<VirtualResourceList {items}>
  {#snippet item(row)}
    <span>{row.name}</span>
  {/snippet}
</VirtualResourceList>
