<script lang="ts">
// I18N
import { getLocaleKey } from '$lib/i18n'
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
import Image from '$lib/components/common/Image.svelte'
// BITS PATTERNS
import { EntityCard, ResourceFilterBar, ResourceIndex } from '$lib/bits'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// ICONS
import LayerIcon from 'virtual:icons/lucide/layers'
import StatusIcon from 'virtual:icons/lucide/circle-dot-dashed'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
// TYPES
import type { KeyMap, ResourceFilterBarConfig } from '$lib/types'
import type { Layer } from '$lib/db/zod/schema/layer.types'

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
  ],
} satisfies ResourceFilterBarConfig

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
let entities: Layer[] = $derived(
  adminCtx.getViewFilteredResource<Layer>(FirstClassResource.layer),
)

$effect(() => {
  headerCtrl.setHeaderForIndex(m.maps__layers(), LayerIcon)
  headerCtrl.setControlBar(ResourceFilterBar, {
    resource: FirstClassResource.layer,
    count: entities.length,
    filters,
    sortables,
  })
  headerCtrl.clearFooter()
})
</script>

<ResourceIndex resource={FirstClassResource.layer} {entities}>
  {#snippet card(entity: Layer)}
    <EntityCard {entity} {keyMap}>
      {#snippet header()}
        <Image
          src="https://placehold.co/600x400/3c1535/CB37C1?font=source-sans-pro&text={entity
            .i18n?.[getLocaleKey()]?.name}"
          alt={entity.i18n?.[getLocaleKey()]?.name || ''}
          layout="cover"
        />
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
