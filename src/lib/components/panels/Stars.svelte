<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Info from '$lib/components/panels/stars/Info.svelte';

import WantToVisit from '$lib/components/panels/stars/WantToVisit.svelte';
import HaveVisited from '$lib/components/panels/stars/HaveVisited.svelte';
// STATE
let isInfoOpen = $state(false);
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
</script>

<Panel position="left" scrollable={false} bind:panelContainer>
  <Header
    panel="stars"
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
