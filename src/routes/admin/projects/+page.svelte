<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// SERVICES
import {
  createSortable,
  createSortables,
  createToggleFilter,
  createTranslationFilter,
} from '$lib/client/services/filters'
// BITS PATTERNS
import { EntityCard, ResourceIndex } from '$lib/bits'
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
// TYPES
import type { KeyMap, ResourceFilterBarConfig } from '$lib/types'
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
        createToggleFilter('hasAttribution', {
          label: m.profile__attribution(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
        }),
        createToggleFilter('hasLicense', {
          label: m.admin__forms_projects_license(),
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
        createTranslationFilter('isAttributionTranslated', {
          label: m.profile__attribution(),
        }),
        createTranslationFilter('isLicenseTranslated', {
          label: m.admin__forms_projects_license(),
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
} satisfies ResourceFilterBarConfig

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('name', m.field_name()),
  createSortable('nameShort', m.field_short_name()),
  createSortable('description', m.filters__content()),
  createSortable('license', m.field_license()),
  createSortable('attribution', m.field_attribution()),
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
})

// STATE
let entities: Project[] = $derived(
  adminCtx.getViewFilteredResource<Project>(FirstClassResource.project),
)
</script>

<ResourceIndex {entities} {filters} {sortables}>
  {#snippet card(entity: Project)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
