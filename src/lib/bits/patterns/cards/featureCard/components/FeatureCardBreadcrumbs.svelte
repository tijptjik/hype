<script lang="ts">
// BITS
import FeatureCardBreadcrumbTrail from './FeatureCardBreadcrumbTrail.svelte'
import FeatureCardShareAction from './FeatureCardShareAction.svelte'
import { Dropdown, Icon } from '#lib/bits/index.js'
// I18N
import { sharingText } from '#lib/sharing/text.js'
import { m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
// AUTH
import { hasDurableAccount, requestAccountUpgrade } from '#lib/auth/upgrade.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { ResourceContext } from '#lib/types.js'
// ICONS
import Camera from 'virtual:icons/proicons/camera'
import MenuIcon from 'virtual:icons/lucide/menu'
import PencilSquare from 'virtual:icons/proicons/compose'
import Squares2x2 from 'virtual:icons/proicons/grid'
import TriangleAlert from 'virtual:icons/proicons/alert-triangle'

let {
  feature,
  onEditSelection,
  showShare = true,
  offsetMenu = false,
}: {
  feature: Feature
  showShare?: boolean
  offsetMenu?: boolean
  onEditSelection?: (() => void) | null
} = $props()

const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
let resolvedHierarchy = $state<ResourceContext | null>(null)
let resolvedHierarchyFeatureId = $state<string | null>(null)
let hierarchyLoadErrorFeatureId = $state<string | null>(null)
const hierarchy = $derived(
  resolvedHierarchyFeatureId === feature.id && resolvedHierarchy
    ? resolvedHierarchy
    : appCtx.getHierarchySync(feature),
)
const hierarchyLoadError = $derived(hierarchyLoadErrorFeatureId === feature.id)

// Resolve hierarchy on the client whenever the card is pointed at another feature.
$effect(() => {
  const resolvedFeature = feature
  const resolvedFeatureId = resolvedFeature.id
  let isCurrent = true

  hierarchyLoadErrorFeatureId = null

  void appCtx
    .getHierarchy(resolvedFeature)
    .then(hierarchy => {
      if (!isCurrent) return
      resolvedHierarchy = hierarchy
      resolvedHierarchyFeatureId = resolvedFeatureId
    })
    .catch(() => {
      if (!isCurrent) return
      hierarchyLoadErrorFeatureId = resolvedFeatureId
    })

  return () => {
    isCurrent = false
  }
})

function openContributionMode(mode: FeatureCardMode): void {
  const user = appCtx.account.user
  if (!hasDurableAccount(user)) {
    requestAccountUpgrade('contribution', window.location.href)
    return
  }
  cardCtx.setMode(mode)
}

/**
 * Omits a generic layer "All" label when its parent is already visible.
 *
 * @param label - Contextual layer label.
 * @param hasParent - Whether the preceding scope is rendered in the breadcrumb.
 * @returns The label to display, or null when the parent makes "All" redundant.
 */
function getDistinctScopeLabel(
  label: string | null,
  hasParent: boolean,
): string | null {
  if (!label || !hasParent) return label

  return label.trim().localeCompare(m.filters__all().trim(), undefined, {
    sensitivity: 'base',
  }) === 0
    ? null
    : label
}

const text = $derived(sharingText())
const actionItems = [
  {
    label: m.such_that_rabbit_pull(),
    icon: TriangleAlert,
    iconClass: 'text-error',
    onSelect: () => {
      openContributionMode(FeatureCardMode.Missing)
    },
  },
  {
    label: m.honest_fluffy_falcon_enjoy(),
    icon: Camera,
    iconClass: 'text-info',
    onSelect: () => {
      openContributionMode(FeatureCardMode.AddPhoto)
    },
  },
]
</script>

{#if appCtx.isInitialised}
  {#if !hierarchyLoadError}
    {@const organisationName = hierarchy.organisation
      ? appCtx.getContextualOrganisationName(hierarchy.organisation, false)
      : null}
    {@const projectName = appCtx.getContextualProjectName(
      hierarchy.project,
      false,
      true,
      Boolean(organisationName),
    )}
    {@const layerName = getDistinctScopeLabel(
      hierarchy.layer ? appCtx.getContextualLayerName(hierarchy.layer, false) : null,
      Boolean(organisationName || projectName),
    )}
    <div
      class="pointer-events-auto flex w-full items-start justify-between bg-(--theme-panel) px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      {#key feature.id}
        <FeatureCardBreadcrumbTrail {organisationName} {projectName} {layerName} />
      {/key}
      {#if cardCtx.isNewMode && onEditSelection}
        <button
          type="button"
          class="text-neutral-content/60 hover:bg-base-content/12 hover:text-neutral-content flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition"
          aria-label="Edit map selection"
          onclick={onEditSelection}
        >
          <Icon src={PencilSquare} class="h-4 w-4" />
        </button>
      {:else}
        <div class="flex shrink-0 items-center gap-1">
          {#if showShare}
            <FeatureCardShareAction {feature} isIconOnly />
          {/if}
          <Dropdown
            ariaLabel={text.menu}
            attached={offsetMenu}
            triggerClass={`h-11 w-11 shrink-0 rounded-full border-none bg-transparent p-0 text-neutral-content hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${offsetMenu ? 'translate-x-[14px] -translate-y-0.5' : ''}`}
            triggerIcon={MenuIcon}
            triggerIconClass="h-5 w-5"
            contentSide="top"
            contentAlignOffset={-12}
            contentAlign="end"
            items={actionItems}
          />
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="pointer-events-auto flex w-full items-center justify-between bg-(--theme-panel) px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      <div
        class="text-neutral-content flex min-w-0 items-center gap-2 font-mono text-xs uppercase"
      >
        <Icon src={Squares2x2} class="h-5 w-5" />
        <span class="text-red-400">Error loading hierarchy</span>
      </div>
      {#if cardCtx.isNewMode && onEditSelection}
        <button
          type="button"
          class="text-neutral-content/60 hover:bg-base-content/12 hover:text-neutral-content flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition"
          aria-label="Edit map selection"
          onclick={onEditSelection}
        >
          <Icon src={PencilSquare} class="h-4 w-4" />
        </button>
      {:else}
        <div class="flex shrink-0 items-center gap-1">
          {#if showShare}
            <FeatureCardShareAction {feature} isIconOnly />
          {/if}
          <Dropdown
            ariaLabel={text.menu}
            attached={offsetMenu}
            triggerClass={`h-11 w-11 shrink-0 rounded-full border-none bg-transparent p-0 text-neutral-content hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${offsetMenu ? 'translate-x-[14px] -translate-y-0.5' : ''}`}
            triggerIcon={MenuIcon}
            triggerIconClass="h-5 w-5"
            contentSide="top"
            contentAlignOffset={-12}
            contentAlign="end"
            items={actionItems}
          />
        </div>
      {/if}
    </div>
  {/if}
{/if}
