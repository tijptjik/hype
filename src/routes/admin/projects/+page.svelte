<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import FilterControlBar from '$lib/components/resources/filters/projects/Root.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// I18N
import { m } from '$lib/i18n';
// ICONS
import { Squares2x2 as ProjectIcon } from '@steeze-ui/heroicons';
// TYPES
import type { KeyMap, Project } from '$lib/types';

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
adminCtx.setFacet(false, false, FirstClassResource.project);

// HEADER SETUP
adminCtx.setHeaderForIndex(m.maps__projects(), ProjectIcon);

// STATE
let entities: Project[] = $derived(
  adminCtx.getViewFilteredResource<Project>(FirstClassResource.project)
);
</script>

<ResourceIndex {entities}>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Project)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
