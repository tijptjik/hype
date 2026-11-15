<script lang="ts">
import { untrack } from 'svelte'
import { StationState } from '../../../src/lib/indoor/station.svelte'
import StationScene from '../../../src/lib/bits/patterns/station/StationScene.svelte'
let limited = $state(false)
let matched = $state(true)
const unit = '85dc0347-d11b-4c8c-9686-dc6697050317'
const station = new StationState(() =>
  limited ? new Set(matched ? [unit] : []) : null,
)
$effect(() => {
  untrack(() => {
    void station.open('KET', undefined, false)
  })
})
</script>
<section
  data-shop-filter-harness
  style="position:fixed;inset:0;z-index:999999;background:white;color:black;overflow:auto"
>
  <button type="button" onclick={() => (limited = !limited)}>
    Toggle featured shops
  </button>
  <button type="button" onclick={() => (matched = !matched)}>
    Toggle matching feature
  </button>
  <span data-policy>{limited ? 'restricted' : 'all'}</span>
  <span data-facilities
    >{station.entries.filter(p => p.kind === 'facility').length}</span
  >
  <ul data-directory>
    {#each station.entries.filter(p => p.kind === 'shop') as place}
      <li data-shop-id={place.id}>
        <button type="button" onclick={() => station.select(place)}>
          {place.name.en}
        </button>
      </li>
    {/each}
  </ul>
  {#if station.data}
    <div style="height:600px">
      <StationScene {station} data={station.data} onSelect={() => {}} />
    </div>
  {/if}
</section>
