<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'code',
  title: 'i18n.name',
  subtitle: 'i18n.nameShort',
  description: 'i18n.description',
  image: 'image',
  badges: [
    {
      label: 'isPublished',
      variant: 'primary',
      type: 'boolean',
      trueText: 'Published',
      falseText: 'Draft'
    },
    {
      label: 'isArchived',
      variant: 'outline',
      type: 'boolean',
      trueText: 'Dead',
      falseText: 'Alive',
      superAdminOnly: true
    }
  ]
};

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setResource(FirstClassResource.project);
adminCtx.setEntity(false);
adminCtx.setFacet(false);

let entities = $derived(adminCtx.filteredProjects);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
