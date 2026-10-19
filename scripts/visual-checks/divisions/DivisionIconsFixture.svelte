<script lang="ts">
import FilteredNeighbourhood from '../../../src/lib/bits/patterns/panels/components/items/FilteredNeighbourhood.svelte'
const classes = ['sar', 'area', 'district', 'macrohood', 'neighbourhood', 'microhood', 'major_island', 'minor_island', 'islet', 'town', 'rural_area', 'village', 'hamlet']
</script>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px">
{#each ['dark','light'] as theme}
<section data-theme={theme} style:background={theme === 'dark' ? '#161219' : '#f7e7ef'} style:color={theme === 'dark' ? '#f7e7ef' : '#211b25'}>
{#each classes as name, i}
<FilteredNeighbourhood row={{id:name, class:name, count:i+1, selected:i===0, name:name === 'sar' ? 'Hong Kong' : name.replaceAll('_',' '), level:i}} onToggle={() => {}} />
{/each}
</section>
{/each}
</div>
