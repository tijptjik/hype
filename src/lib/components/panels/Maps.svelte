<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Info from '$lib/components/panels/maps/Info.svelte';
import Organisations from '$lib/components/panels/maps/Organisations.svelte';
import Projects from '$lib/components/panels/maps/Projects.svelte';
import Layers from '$lib/components/panels/maps/Layers.svelte';
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
</script>

<Panel position="left" scrollable={true} bind:panelContainer>
  <Header
    panel="maps"
    title={m.maps__title()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }} />
  <Info isOpen={isInfoOpen} />
  <div class="flex flex-col overflow-y-auto overscroll-none">
    <div class="flex-grow-1 flex min-h-0 flex-col">
      <Organisations />
    </div>
    <div class="flex-grow-1 flex min-h-0 flex-col">
      <Projects />
    </div>
    <div class="flex-grow-4 flex min-h-0 flex-col">
      <Layers />
    </div>
  </div>
</Panel>
