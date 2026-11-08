<script lang="ts">
// SVELTE
import { page } from '$app/state'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { useAdminIndexQuery } from '#lib/adapters/useAdminIndexQuery.svelte.js'
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
import IndexCard from '#lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import ResourceControlBar from '#lib/bits/patterns/resource/resourceControlBar/ResourceControlBar.svelte'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
import ResourceRow from '#lib/bits/patterns/resource/rows/ResourceRow/ResourceRow.svelte'
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
const indexQuery = useAdminIndexQuery(adminCtx, 'hub')
let entities: Hub[] = $derived(indexQuery.rows as Hub[])
// Load on every route entry; the adapter also follows filter and account changes.

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
      count: indexQuery.totalCount,
      countLoading: indexQuery.countLoading,
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

{#if indexQuery.failed}
  <div class="p-6 text-center" role="alert">
    <p>{m.bootstrap__error()}</p>
    <button
      type="button"
      class="bg-base-content text-base-100 mt-4 rounded-lg px-4 py-2"
      onclick={() => void indexQuery.retry()}
    >
      {m.bootstrap__retry()}
    </button>
  </div>
{:else}
  <ResourceIndex
    resource={FirstClassResource.hub}
    {entities}
    isInitialised={indexQuery.isInitialised || entities.length > 0}
  >
    {#snippet card(entity: Hub)}
      <IndexCard {...getIndexModel(entity)} />
    {/snippet}
    {#snippet row(entity: Hub, index)}
      <ResourceRow
        {index}
        breadcrumbColumnCount={3}
        breadcrumbVariant="stats"
        {...getIndexModel(entity)}
      />
    {/snippet}
  </ResourceIndex>
{/if}
