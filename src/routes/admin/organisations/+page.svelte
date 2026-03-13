<script lang="ts">
import { page } from '$app/state'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { createAdminIndexCardModel } from '$lib/adapters/cards/createAdminIndexCardModel'
// SERVICES
import {
  createSortable,
  createSortables,
  createToggleFilter,
  createTranslationFilter,
} from '$lib/client/services/filters'
// BITS PATTERNS
import { IndexCard, ResourceControlBar, ResourceIndex } from '$lib/bits'
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
import StatusIcon from 'virtual:icons/lucide/circle-dot-dashed'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ImageIcon from 'virtual:icons/lucide/image'
// TYPES
import type { KeyMap, ResourceControlBarConfig } from '$lib/types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'

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

const filters = {
  resource: FirstClassResource.organisation,
  sections: [
    {
      key: 'status',
      title: m.filters__status(),
      icon: StatusIcon,
      filters: [
        createToggleFilter('isPublished', {
          label: m.published(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isArchived', {
          label: m.bad_swift_cheetah_surge(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
          superAdminOnly: true,
        }),
      ],
    },
    {
      key: 'authorship',
      title: m.filters__content(),
      icon: BookOpenIcon,
      filters: [
        createToggleFilter('hasName', {
          label: m.admin__forms_common_name_full(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
        }),
        createToggleFilter('hasContextualName', {
          label: m.admin__forms_common_name_short(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
        }),
        createToggleFilter('hasDescription', {
          label: m.feature__description(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
        }),
      ],
    },
    {
      key: 'translation',
      title: m.filters__translation(),
      icon: LanguagesIcon,
      filters: [
        createTranslationFilter('isNameTranslated', {
          label: m.admin__forms_common_name_full(),
        }),
        createTranslationFilter('isContextualNameTranslated', {
          label: m.admin__forms_common_name_short(),
        }),
        createTranslationFilter('isDescriptionTranslated', {
          label: m.feature__description(),
        }),
      ],
    },
    {
      key: 'image',
      title: m.filters__image(),
      icon: ImageIcon,
      filters: [
        createToggleFilter('hasImage', {
          label: m.filters__image(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
        }),
      ],
    },
  ],
} satisfies ResourceControlBarConfig

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('name', m.field_name()),
  createSortable('nameShort', m.field_short_name()),
  createSortable('description', m.filters__content()),
  createSortable('code', m.field_code()),
])

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
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.organisation,
      count: entities.length,
      filters,
      sortables,
    },
    {
      isVisible:
        adminCtx.appCtx.state.ui.isControlBarVisible[FirstClassResource.organisation],
    },
  )
  headerCtrl.clearFooter()
})
// STATE
let entities: Organisation[] = $derived(
  adminCtx.getViewFilteredResource<Organisation>(FirstClassResource.organisation),
)
</script>

<ResourceIndex resource={FirstClassResource.organisation} {entities}>
  {#snippet card(entity: Organisation)}
    <IndexCard
      {...createAdminIndexCardModel({
        adminCtx,
        entity,
        keyMap,
        search: page.url.search,
      })}
    />
  {/snippet}
</ResourceIndex>
