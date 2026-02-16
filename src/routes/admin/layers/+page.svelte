<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
import { getHeaderCtrl } from '$lib/context/header.svelte';
// COMPONENTS
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import Image from '$lib/components/common/Image.svelte';
import FilterControlBar from '$lib/components/resources/filters/layers/Root.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// I18N
import { m } from '$lib/i18n';
// ICONS
import LayerIcon from 'virtual:icons/lucide/layers';
// TYPES
import type { KeyMap, Layer } from '$lib/types';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
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
const headerCtrl = getHeaderCtrl();
adminCtx.setFacet(false, false, FirstClassResource.layer);

// HEADER SETUP
headerCtrl.setHeaderForIndex(m.maps__layers(), LayerIcon);

// STATE
let entities: Layer[] = $derived(
  adminCtx.getViewFilteredResource<Layer>(FirstClassResource.layer)
);
</script>

<ResourceIndex {entities}>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Layer)}
    <EntityCard {entity} {keyMap}>
      {#snippet header()}
        <Image
          src="https://placehold.co/600x400/3c1535/CB37C1?font=source-sans-pro&text={entity
            .i18n?.[getLocale()]?.name}"
          alt={entity.i18n?.[getLocale()]?.name || ''}
          layout="cover" />
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
