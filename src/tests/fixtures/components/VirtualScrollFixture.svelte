<script lang="ts">
import VirtualList from '#lib/bits/custom/index/src/VirtualList.svelte'
const items = Array.from({ length: 10000 }, (_, id) => ({ id }))
</script>
<div style="height: 600px; width: 800px; position: relative;">
  <VirtualList
    {items}
    height="100%"
    itemHeight={78}
    rowGap={6}
    padding={12}
    bufferBefore={8}
    bufferAfter={10}
    getKey={row => row.id}
  >
    {#snippet children(
      row,
    )}
      <div data-row={row.id} style="height: 72px; background: #ddd;">Row {row.id}</div>
    {/snippet}
    {#snippet placeholder(
      height,
    )}
      <div data-skeleton style:height={`${height}px`} style:background="#aaa"></div>
    {/snippet}
  </VirtualList>
</div>
