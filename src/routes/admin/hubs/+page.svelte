<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// COMPONENTS
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte'
import EntityCard from '$lib/components/resources/EntityCard.svelte'
import FilterControlBar from '$lib/components/resources/filters/hubs/Root.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import HubIcon from 'virtual:icons/lucide/building-2'
// TYPES
import type { KeyMap, Hub } from '$lib/types'

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'code',
  title: 'i18n.name',
  subtitle: 'domain',
  description: 'i18n.description',
  image: 'image',
}

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.hub)

// HEADER SETUP
headerCtrl.setHeaderForIndex(m.hub__title(), HubIcon)

// STATE
let entities: Hub[] = $derived(
  adminCtx.isInitialised
    ? adminCtx.getViewFilteredResource<Hub>(FirstClassResource.hub)
    : [],
)
</script>

<ResourceIndex {entities}>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Hub)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
