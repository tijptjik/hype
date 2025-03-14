<script lang="ts">
// I18N
import * as m from '$lib/paraglide/messages.js';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import Organisations from '$lib/components/panels/maps/Organisations.svelte';
import Projects from '$lib/components/panels/maps/Projects.svelte';
import Layers from '$lib/components/panels/maps/Layers.svelte';
</script>

<Panel direction="left" scrollable={false}>
  <Header panel="maps" title={m.maps__title()} subtitle={m.maps__subtitle()} />
  <div class="flex h-[calc(100vh-134px)] flex-col">
    <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
      <Organisations />
    </div>
    <div class="flex-grow-2 flex-shrink-2 flex min-h-0 flex-col">
      <Projects />
    </div>
    <div class="flex-grow-4 flex-shrink-1 flex min-h-0 flex-col">
      <Layers />
    </div>
  </div>
</Panel>
