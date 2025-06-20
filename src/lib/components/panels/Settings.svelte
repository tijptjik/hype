<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte';
import Panel from '$lib/components/layout/Panel.svelte';
import Info from '$lib/components/panels/settings/Info.svelte';
import Profile from '$lib/components/panels/settings/Profile.svelte';
import Language from '$lib/components/panels/settings/Language.svelte';
import Contributor from '$lib/components/panels/settings/Contributor.svelte';
import DefaultMap from '$lib/components/panels/settings/DefaultMap.svelte';
import Experimental from '$lib/components/panels/settings/Experimental.svelte';
import Admin from '$lib/components/panels/settings/Admin.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
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
</script>

<Panel position="right" scrollable={true} bind:panelContainer>
  <Header
    panel="settings"
    title={m.settings__title()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }} />
  <Info isOpen={isInfoOpen} />

  <Profile />
  <div class="flex h-[calc(100vh-206px)] flex-col">
    {#if appCtx.isAdmin()}
      <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
        <Admin />
      </div>
      <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
        <Language defaultOpen={false} />
      </div>
    {:else}
      <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
        <Language />
      </div>
      <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
        <Contributor />
      </div>
      <div class="flex-grow-1 flex max-h-[calc(50vh)] min-h-0 flex-shrink-0 flex-col">
        <DefaultMap />
      </div>
      <div class="flex-grow-1 flex max-h-[calc(50vh)] min-h-0 flex-shrink-0 flex-col">
        <Experimental />
      </div>
    {/if}
  </div>
</Panel>
