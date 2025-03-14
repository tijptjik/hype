<script lang="ts">
// I18N
import * as m from '$lib/paraglide/messages.js';
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte';
import Header from '$lib/components/panels/common/Header.svelte';
import WantToVisit from '$lib/components/panels/stars/WantToVisit.svelte';
import HaveVisited from '$lib/components/panels/stars/HaveVisited.svelte';
</script>

<Panel direction="left">
  <Header panel="stars" title={m.stars__title()} subtitle={m.stars__subtitle()} />
  <WantToVisit />
  <HaveVisited />
</Panel>
