<script lang="ts">
import { page } from '$app/state'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { createAdminIndexCardModel } from '#lib/adapters/cards/createAdminIndexCardModel.js'
// SERVICES
import {
  createSortable,
  createSortables,
  createToggleFilter,
  createTranslationFilter,
} from '#lib/client/services/filters.js'
// BITS PATTERNS
import {
  IndexCard,
  ResourceControlBar,
  ResourceIndex,
  ResourceRow,
} from '#lib/bits/index.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// ICONS
import HubIcon from 'virtual:icons/proicons/building-multiple'
import StatusIcon from 'virtual:icons/proicons/target'
import BookOpenIcon from 'virtual:icons/proicons/book-open'
import LanguagesIcon from 'virtual:icons/tabler/language'
// TYPES
import type { KeyMap } from '#lib/client/services/resourceCards.types.js'
import type { ResourceControlBarConfig } from '#lib/client/services/resourceFilters.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'code',
  title: 'i18n.name',
  subtitle: 'domain',
  description: 'i18n.description',
  image: 'image',
}

const filters = {
  resource: FirstClassResource.hub,
  sections: [
    {
      key: 'status',
      title: m.filters__status(),
      icon: StatusIcon,
      filters: [
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
  ],
} satisfies ResourceControlBarConfig

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('name', m.field_name()),
  createSortable('nameShort', m.field_short_name()),
  createSortable('description', m.filters__content()),
  createSortable('code', m.field_code()),
  createSortable('domain', 'Domain'),
])

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.hub)

// STATE
let entities: Hub[] = $derived(
  adminCtx.getViewFilteredResource<Hub>(FirstClassResource.hub),
)

function getIndexModel(entity: Hub) {
  return createAdminIndexCardModel({
    adminCtx,
    resourceType: FirstClassResource.hub,
    entity,
    keyMap,
    search: page.url.search,
  })
}

$effect(() => {
  headerCtrl.setHeaderForIndex(m.hub__title(), HubIcon)
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.hub,
      count: entities.length,
      filters,
      sortables,
    },
    {
      isVisible: adminCtx.listUi.state.isControlBarVisible[FirstClassResource.hub],
    },
  )
  headerCtrl.clearFooter()
})
</script>

<ResourceIndex resource={FirstClassResource.hub} {entities}>
  {#snippet card(
    entity: Hub,
  )}
    <IndexCard {...getIndexModel(entity)} />
  {/snippet}
  {#snippet row(
    entity: Hub,
    index,
  )}
    <ResourceRow
      {index}
      breadcrumbColumnCount={3}
      breadcrumbVariant="stats"
      {...getIndexModel(entity)}
    />
  {/snippet}
</ResourceIndex>
