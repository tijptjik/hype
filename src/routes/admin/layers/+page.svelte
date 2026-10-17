<script lang="ts">
import { usePanelResources } from '#lib/context/panel-resources.svelte.js'
import { page } from '$app/state'
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
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import LayerIcon from 'virtual:icons/proicons/layers'
import StatusIcon from 'virtual:icons/proicons/target'
import BookOpenIcon from 'virtual:icons/proicons/book-open'
import LanguagesIcon from 'virtual:icons/tabler/language'
import CopyleftIcon from 'virtual:icons/proicons/copyright'
// TYPES
import type { KeyMap } from '#lib/client/services/resourceCards.types.js'
import type { ResourceControlBarConfig } from '#lib/client/services/resourceFilters.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'

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
      falseText: 'Draft',
    },
    {
      label: 'isArchived',
      variant: 'outline',
      type: 'boolean',
      trueText: 'Dead',
      falseText: 'Alive',
      superAdminOnly: true,
    },
  ],
}

const filters = {
  resource: FirstClassResource.layer,
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
      key: 'license',
      title: m.field_license(),
      icon: CopyleftIcon,
      filters: [
        createToggleFilter('isAllRightsReserved', {
          label: 'Ⓒ',
          tooltip: 'All rights reserved for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isPublicDomain', {
          label: '🄏',
          tooltip: 'Public domain commitment for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseBy', {
          label: 'BY',
          tooltip: 'Attribution required for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseSa', {
          label: 'SA',
          tooltip: 'Share alike for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseNc', {
          label: 'NC',
          tooltip: 'Non-commercial for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseNd', {
          label: 'ND',
          tooltip: 'No derivatives for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
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
])

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.layer)

// STATE
const resourceList = usePanelResources(
  adminCtx.view,
  'layer',
  () => adminCtx.view.state.filters.layer.text ?? '',
  'index',
)
let entities: Layer[] = $derived(
  adminCtx.applyLayerViewFilters(resourceList.rows as unknown as Layer[]) as Layer[],
)

function getIndexModel(entity: Layer) {
  return createAdminIndexCardModel({
    adminCtx,
    resourceType: FirstClassResource.layer,
    entity,
    keyMap,
    search: page.url.search,
  })
}

$effect(() => {
  headerCtrl.setHeaderForIndex(m.maps__layers(), LayerIcon)
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.layer,
      count: entities.length,
      filters,
      sortables,
    },
    {
      isVisible: adminCtx.listUi.state.isControlBarVisible[FirstClassResource.layer],
    },
  )
  headerCtrl.clearFooter()
})
</script>

<ResourceIndex
  isInitialised={resourceList.list.isInitialised}
  onNearEnd={() => resourceList.list.next()}
  hasMore={resourceList.list.hasMore}
  isLoadingMore={resourceList.list.loading}
  resource={FirstClassResource.layer}
  {entities}
>
  {#snippet card(
    entity: Layer,
  )}
    <IndexCard {...getIndexModel(entity)} />
  {/snippet}
  {#snippet row(
    entity: Layer,
    index,
  )}
    <ResourceRow {index} breadcrumbColumnCount={2} {...getIndexModel(entity)} />
  {/snippet}
</ResourceIndex>
