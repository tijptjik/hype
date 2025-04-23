<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Info from '$lib/components/panels/filters/Info.svelte';
import Reset from '$lib/components/panels/filters/Reset.svelte';
import Neighbourhoods from '$lib/components/panels/filters/Neighbourhoods.svelte';
import Categories from '$lib/components/panels/filters/Categories.svelte';
// STATE
let isInfoOpen = $state(false);

let handleToggleInfo = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation();
  isInfoOpen = !isInfoOpen;
};
</script>

<Panel position="right" scrollable={true}>
  <Header
    panel="filters"
    title={m.filters__title()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }} />
  <Reset />
  <Info isOpen={isInfoOpen} />
  <div class="flex flex-col">
    <div class="flex-grow-1 flex max-h-[40vh] min-h-0 flex-shrink-0 flex-col">
      <Neighbourhoods />
    </div>
    <div
      class="flex-grow-1 flex max-h-[calc(100vh-206px)] min-h-0 flex-shrink-0 flex-col">
      <Categories />
    </div>
  </div>
</Panel>
