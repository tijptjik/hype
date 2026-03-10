<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// SERVICES
import {
  createToggleFilter,
  createTranslationFilter,
} from '$lib/client/services/filters'
// COMPONENTS
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte'
import EntityCard from '$lib/components/resources/EntityCard.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import HubIcon from 'virtual:icons/lucide/building-2'
import ListFilterIcon from 'virtual:icons/lucide/list-filter'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
// TYPES
import type { KeyMap, ResourceFilterBarConfig } from '$lib/types'
import type { Hub } from '$lib/db/zod/schema/hub.types'

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
      icon: ListFilterIcon,
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
} satisfies ResourceFilterBarConfig

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

<ResourceIndex {entities} {filters}>
  {#snippet card(entity: Hub)}
    <EntityCard entity={entity as any} {keyMap} />
  {/snippet}
</ResourceIndex>
