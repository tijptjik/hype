<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Info from '$lib/components/panels/info/Filters.svelte';
import Reset from '$lib/components/panels/controls/Reset.svelte';
import Neighbourhoods from '$lib/components/panels/sections/Neighbourhoods.svelte';
import Categories from '$lib/components/panels/sections/Categories.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { PanelProps } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// STATE
let isInfoOpen = $state(false);
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement;

let handleToggleInfo = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation();
  isInfoOpen = !isInfoOpen;
  if (isInfoOpen) {
    setTimeout(() => {
      panelContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  }
};

let panelProps: PanelProps = $derived({
  panelType: 'filters',
  position: 'right',
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: appCtx.isPanelNarrow('settings'),
  isAdmin: appCtx.isAdmin(),
  active: {
    resourceType: appCtx.getActiveResourceType(),
    resourceRef: appCtx.getActiveResourceRef(),
    resourceId: appCtx.getActiveResourceId(),
    facet: appCtx.getActiveFacet()
  }
});
</script>

<!-- TODO : There's a bug where the map doesn't update when the filters are changed. To reproduce:
1. Open the filters
2. aggressively play around with the range slider
3. after a while the features will no longer reflect the filters
even selecting a neighbourhood will not correctly affect the features shown on the map
-->

<Panel bind:panelContainer {...panelProps}>
  <Header
    {...panelProps}
    title={m.filters__title()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }} />
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
  <Reset />
</Panel>
