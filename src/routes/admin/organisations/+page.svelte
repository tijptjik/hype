<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// COMPONENTS
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte'
import EntityCard from '$lib/components/resources/EntityCard.svelte'
import FilterControlBar from '$lib/components/resources/filters/organisations/Root.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// AUTHORIZATION
import {
  authorizeOrganisationCreate,
  toOrganisationAuthActor,
} from '$lib/api/services/authz'
// ICONS
import OrganisationIcon from 'virtual:icons/lucide/users-round'
// TYPES
import type { KeyMap, Organisation } from '$lib/types'

// CONFIG :: KEY MAP
const RESOURCE = FirstClassResource.organisation
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
      falseText: 'Draft',
    },
    {
      label: 'isArchived',
      variant: 'outline',
      type: 'boolean',
      trueText: 'Dead',
      falseText: 'Live',
      superAdminOnly: true,
    },
  ],
}

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, RESOURCE)

const currentUser = $derived(adminCtx.appCtx.getUser())
const currentHub = $derived(adminCtx.appCtx.hub)
const currentActor = $derived(toOrganisationAuthActor(currentUser))

const canCreateOrganisation = $derived.by(() => {
  const decision = authorizeOrganisationCreate(
    currentActor,
    {
      resourceHubId: currentHub?.isCore ? null : (currentHub?.id ?? null),
    },
    ['code'],
  )

  return decision.allowed
})

// HEADER SETUP
$effect(() => {
  headerCtrl.setHeaderForIndex(m.maps__organisations(), OrganisationIcon, {
    showNew: canCreateOrganisation,
  })
})
// STATE
let entities: Organisation[] = $derived(
  adminCtx.getViewFilteredResource<Organisation>(FirstClassResource.organisation),
)
</script>

<ResourceIndex {entities}>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Organisation)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
