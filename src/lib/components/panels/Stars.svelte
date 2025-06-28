<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Info from '$lib/components/panels/info/Stars.svelte';
import WantToVisit from '$lib/components/panels/sections/WantToVisit.svelte';
import HaveVisited from '$lib/components/panels/sections/HaveVisited.svelte';
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

let isVisitedOpen = $state(false);
let handleToggleVisited = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation();
  isVisitedOpen = !isVisitedOpen;
};

let isWantToVisitOpen = $state(false);
let handleToggleWantToVisit = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation();
  isWantToVisitOpen = !isWantToVisitOpen;
};

let panelProps: PanelProps = $derived({
  panelType: 'stars',
  position: 'left',
  scrollable: false,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false
});
</script>

<Panel bind:panelContainer {...panelProps}>
  <Header
    {...panelProps}
    title={m.stars__title()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }} />
  <Info isOpen={isInfoOpen} />
  <div class="flex h-full overflow-hidden">
    <div class="flex h-[calc(100dvh-140px)] w-full flex-col overflow-hidden">
      <WantToVisit />
      <HaveVisited />
    </div>
  </div>
</Panel>
