<script lang="ts">
// I18N
import * as m from '$lib/paraglide/messages.js';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Reset from '$lib/components/panels/filters/Reset.svelte';
import Neighbourhoods from '$lib/components/panels/filters/Neighbourhoods.svelte';
import Categories from '$lib/components/panels/filters/Categories.svelte';
</script>

<Panel direction="right" scrollable={true}>
  <Header panel="filters" title={m.filters__title()} subtitle={m.filters__subtitle()} />
  <Reset />
  <div class="flex h-[calc(100vh-206px)] flex-col">
    <div class="flex-grow-1 flex max-h-[calc(50vh)] min-h-0 flex-shrink-0 flex-col">
      <Neighbourhoods />
    </div>
    <div
      class="flex-grow-1 flex max-h-[calc(100vh-206px)] min-h-0 flex-shrink-0 flex-col">
      <Categories />
    </div>
  </div>
</Panel>
