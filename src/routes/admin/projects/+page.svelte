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
// AUTHORIZATION
import {
  canCreateAnyProject,
  toProjectAuthActor,
} from '#lib/api/services/authz/index.js'
// ICONS
import ProjectIcon from 'virtual:icons/proicons/grid'
import StatusIcon from 'virtual:icons/proicons/target'
import BookOpenIcon from 'virtual:icons/proicons/book-open'
import LanguagesIcon from 'virtual:icons/tabler/language'
import ImageIcon from 'virtual:icons/proicons/photo'
import CopyleftIcon from 'virtual:icons/proicons/copyright'
// TYPES
import type { KeyMap } from '#lib/client/services/resourceCards.types.js'
import type { ResourceControlBarConfig } from '#lib/client/services/resourceFilters.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'

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
  resource: FirstClassResource.project,
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
          label: 'Public Domain',
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
  createSortable('code', m.field_code()),
])

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.project)

const currentUser = $derived(adminCtx.view.account.user)
const currentHub = $derived(adminCtx.view.hub)
const currentActor = $derived(toProjectAuthActor(currentUser))

const canCreateProject = $derived.by(() =>
  canCreateAnyProject(currentActor, {
    resourceHubId: currentHub?.isCore ? null : (currentHub?.id ?? null),
  }),
)

// HEADER SETUP
$effect(() => {
  headerCtrl.setHeaderForIndex(m.maps__projects(), ProjectIcon, {
    showNew: canCreateProject,
  })
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.project,
      count: entities.length,
      filters,
      sortables,
    },
    {
      isVisible: adminCtx.listUi.state.isControlBarVisible[FirstClassResource.project],
    },
  )
  headerCtrl.clearFooter()
})

// STATE
const resourceList = usePanelResources(
  adminCtx.view,
  'project',
  () => adminCtx.view.filters.values.project.text ?? '',
  'index',
)
let entities: Project[] = $derived(
  adminCtx.view.filters.applyProjectViewFilters(
    resourceList.rows as unknown as Project[],
  ) as Project[],
)

function getIndexModel(entity: Project) {
  return createAdminIndexCardModel({
    adminCtx,
    resourceType: FirstClassResource.project,
    entity,
    keyMap,
    search: page.url.search,
  })
}
</script>

<ResourceIndex
  isInitialised={resourceList.list.isInitialised}
  onNearEnd={() => resourceList.list.next()}
  hasMore={resourceList.list.hasMore}
  isLoadingMore={resourceList.list.loading}
  resource={FirstClassResource.project}
  {entities}
>
  {#snippet card(
    entity: Project,
  )}
    <IndexCard {...getIndexModel(entity)} />
  {/snippet}
  {#snippet row(
    entity: Project,
    index,
  )}
    <ResourceRow {index} breadcrumbColumnCount={1} {...getIndexModel(entity)} />
  {/snippet}
</ResourceIndex>
