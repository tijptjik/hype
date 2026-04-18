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
import { IndexCard, ResourceControlBar, ResourceIndex, ResourceRow } from '$lib/bits'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// AUTHORIZATION
import { canCreateAnyProject, toProjectAuthActor } from '$lib/api/services/authz'
// ICONS
import ProjectIcon from 'virtual:icons/lucide/layout-grid'
import StatusIcon from 'virtual:icons/lucide/circle-dot-dashed'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ImageIcon from 'virtual:icons/lucide/image'
import CopyleftIcon from 'virtual:icons/lucide/copyright'
// TYPES
import type { KeyMap, ResourceControlBarConfig } from '$lib/types'
import type { Project } from '$lib/db/zod/schema/project.types'

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
          falseLabel: m.filters__is(),
          trueLabel: m.filters__not(),
        }),
        createToggleFilter('isArchived', {
          label: m.bad_swift_cheetah_surge(),
          falseLabel: m.filters__is(),
          trueLabel: m.filters__not(),
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

const currentUser = $derived(adminCtx.appCtx.getUser())
const currentHub = $derived(adminCtx.appCtx.hub)
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
      isVisible:
        adminCtx.appCtx.state.ui.isControlBarVisible[FirstClassResource.project],
    },
  )
  headerCtrl.clearFooter()
})

// STATE
let entities: Project[] = $derived(
  adminCtx.getViewFilteredResource<Project>(FirstClassResource.project),
)

function getIndexModel(entity: Project) {
  return createAdminIndexCardModel({
    adminCtx,
    entity,
    keyMap,
    search: page.url.search,
  })
}
</script>

<ResourceIndex resource={FirstClassResource.project} {entities}>
  {#snippet card(entity: Project)}
    <IndexCard {...getIndexModel(entity)} />
  {/snippet}
  {#snippet row(entity: Project, index)}
    <ResourceRow {index} breadcrumbColumnCount={1} {...getIndexModel(entity)} />
  {/snippet}
</ResourceIndex>
