<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Profile from '$lib/components/panels/settings/Profile.svelte';
import Language from '$lib/components/panels/settings/Language.svelte';
import Contributor from '$lib/components/panels/settings/Contributor.svelte';
import DefaultMap from '$lib/components/panels/settings/DefaultMap.svelte';
import Experimental from '$lib/components/panels/settings/Experimental.svelte';
</script>

<Panel position="right" scrollable={true}>
  <Header
    panel="settings"
    title={m.settings__title()}
    subtitle={m.settings__subtitle()} />
  <Profile />
  <div class="flex h-[calc(100vh-206px)] flex-col">
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
  </div>
</Panel>
