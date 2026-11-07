<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// BITS
import { Dropdown } from '#lib/bits/index.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
// I18N
import { getI18n } from '#lib/i18n.js'
import { sharingText } from '#lib/sharing/text.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { ResourceContext } from '#lib/types.js'
import type { DropdownItem } from '#lib/bits/core/dropdown/dropdown.types.js'
import type { ShareTarget } from '#lib/sharing/resource.js'
// ICONS
import ShareIcon from 'virtual:icons/lucide/share-2'
import OrganisationIcon from 'virtual:icons/lucide/building-2'
import ProjectIcon from 'virtual:icons/lucide/map'
import LayerIcon from 'virtual:icons/lucide/layers'
import FeatureIcon from 'virtual:icons/lucide/map-pin'

let { feature, isIconOnly = false }: { feature: Feature; isIconOnly?: boolean } =
  $props()
const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
const text = $derived(sharingText())
let resolvedHierarchy = $state<ResourceContext | null>(null)
let resolvedHierarchyFeatureId = $state<string | null>(null)
const hierarchy = $derived(
  resolvedHierarchyFeatureId === feature.id && resolvedHierarchy
    ? resolvedHierarchy
    : appCtx.getHierarchySync(feature),
)

// Resolve hierarchy on the client whenever the card is pointed at another feature.
$effect(() => {
  const resolvedFeature = feature
  const resolvedFeatureId = resolvedFeature.id
  let isCurrent = true

  void appCtx
    .getHierarchy(resolvedFeature)
    .then(hierarchy => {
      if (!isCurrent) return
      resolvedHierarchy = hierarchy
      resolvedHierarchyFeatureId = resolvedFeatureId
    })
    .catch(() => {
      // Keep the synchronously available scopes when hierarchy loading fails.
    })

  return () => {
    isCurrent = false
  }
})

const shareItems = $derived.by(() => {
  const items: DropdownItem[] = []
  const preferences = appCtx.getUserPreferences()
  const add = (target: ShareTarget, icon: typeof ShareIcon): void => {
    items.push({
      label: target.title,
      eyebrow: text[target.kind],
      icon,
      onSelect: () => {
        cardCtx.shareTarget = target
      },
    })
  }
  if (hierarchy.organisation)
    add(
      {
        kind: 'organisation',
        ref: hierarchy.organisation.code,
        title: getI18n(
          hierarchy.organisation,
          'nameShort',
          preferences,
          getI18n(hierarchy.organisation, 'name', preferences),
        ),
      },
      OrganisationIcon,
    )
  if (hierarchy.project)
    add(
      {
        kind: 'project',
        ref: hierarchy.project.code,
        title: getI18n(
          hierarchy.project,
          'nameShort',
          preferences,
          getI18n(hierarchy.project, 'name', preferences),
        ),
      },
      ProjectIcon,
    )
  if (hierarchy.layer)
    add(
      {
        kind: 'layer',
        ref: hierarchy.layer.id,
        title: getI18n(hierarchy.layer, 'name', preferences),
      },
      LayerIcon,
    )
  add(
    {
      kind: 'feature',
      ref: feature.id,
      title: getI18n(feature, 'title', preferences),
    },
    FeatureIcon,
  )
  return items
})

// A newly selected feature must not retain the previous feature's share target.
let sharingFeatureId = $state('')
$effect(() => {
  const id = feature.id
  if (id !== untrack(() => sharingFeatureId)) {
    sharingFeatureId = id
    cardCtx.shareTarget = null
  }
})
</script>

{#if appCtx.isInitialised}
  <Dropdown
    ariaLabel={text.share}
    triggerId="feature-share-trigger"
    onCloseAutoFocus={event => {
      // The selected sharing panel owns focus; Escape without selection restores the trigger.
      if (cardCtx.shareTarget) {
        event.preventDefault()
        // Wait for the menu's modal focus scope to release before entering the panel.
        requestAnimationFrame(() =>
          document
            .getElementById('feature-share-heading')
            ?.focus({ preventScroll: true }),
        )
      }
    }}
    triggerIcon={ShareIcon}
    triggerLabel={isIconOnly ? undefined : text.share}
    triggerIconClass={isIconOnly ? '' : 'h-6 w-6 shrink-0'}
    triggerClass={`h-11 border-none bg-transparent text-neutral-content hover:bg-transparent hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isIconOnly ? 'w-11' : 'w-[10.5rem] min-w-[10.5rem] justify-start gap-2 px-3 text-base font-medium uppercase leading-none tracking-[0.16em]'}`}
    contentSide="top"
    contentAlign="end"
    itemClass="grid grid-cols-[1rem_minmax(0,1fr)] min-w-0 whitespace-normal break-words"
    items={shareItems}
  />
{/if}
