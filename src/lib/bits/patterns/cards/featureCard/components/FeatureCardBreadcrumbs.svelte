<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// BITS
import { Dropdown, Icon } from '$lib/bits'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
// AUTH
import { hasDurableAccount, requestAccountUpgrade } from '$lib/auth/upgrade'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { ResourceContext } from '$lib/types'
// ICONS
import Camera from 'virtual:icons/lucide/camera'
import MoreHorizontal from 'virtual:icons/lucide/ellipsis'
import PencilSquare from 'virtual:icons/lucide/square-pen'
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
import TriangleAlert from 'virtual:icons/lucide/triangle-alert'

let {
  feature,
  onEditSelection,
}: {
  feature: Feature
  onEditSelection?: (() => void) | null
} = $props()

const appCtx = getAppCtx()
const cardCtx = getCardCtx()
let resolvedHierarchy = $state<ResourceContext | null>(null)
let hierarchyLoadError = $state(false)
const hierarchy = $derived(resolvedHierarchy ?? appCtx.getHierarchySync(feature))

/** Resolves a complete feature hierarchy after the breadcrumb has mounted. */
async function loadHierarchy(): Promise<void> {
  try {
    resolvedHierarchy = await appCtx.getHierarchy(feature)
  } catch {
    hierarchyLoadError = true
  }
}

// Hierarchy cache misses can issue remote queries, which must never run during SSR.
onMount(() => {
  void loadHierarchy()
})

function openContributionMode(mode: FeatureCardMode): void {
  const user = appCtx.getUser()
  if (!hasDurableAccount(user)) {
    requestAccountUpgrade('contribution', window.location.href)
    return
  }
  cardCtx.setMode(mode)
}

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
    {@const projectName = appCtx.getContextualProjectName(hierarchy.project, false)}
    {@const layerName = hierarchy.layer
      ? appCtx.getContextualLayerName(hierarchy.layer, false)
      : null}
    <div
      class="pointer-events-auto flex w-full items-center justify-between bg-black px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      <div
        class="flex min-w-0 items-center gap-2 font-mono text-xs uppercase text-neutral-content"
      >
        <Icon src={Squares2x2} class="h-5 w-5 shrink-0" />
        <span class="!block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          >{organisationName}</span
        >
        {#if hierarchy.project && projectName}
          <span class="shrink-0 text-gray-400">›</span>
          <span class="!block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
            >{projectName}</span
          >
        {/if}
        {#if hierarchy.layer && layerName}
          <span class="shrink-0 text-gray-400">›</span>
          <span
            class="hidden w-120:inline overflow-hidden text-ellipsis whitespace-nowrap"
            >{layerName}</span
          >
        {/if}
      </div>
      {#if cardCtx.isNewMode && onEditSelection}
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-content/60 transition hover:bg-white/6 hover:text-neutral-content"
          aria-label="Edit map selection"
          onclick={onEditSelection}
        >
          <Icon src={PencilSquare} class="h-4 w-4" />
        </button>
      {:else}
        <Dropdown
          ariaLabel={m.antsy_patient_moth_taste()}
          triggerClass="h-5 w-5 shrink-0 rounded-full border-none bg-transparent p-0 text-neutral-content/60 hover:bg-transparent hover:text-neutral-content"
          triggerIcon={MoreHorizontal}
          triggerIconClass="h-4 w-4"
          contentSide="top"
          contentAlignOffset={-12}
          contentAlign="end"
          items={actionItems}
        />
      {/if}
    </div>
  {:else}
    <div
      class="pointer-events-auto flex w-full items-center justify-between bg-black px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      <div
        class="flex min-w-0 items-center gap-2 font-mono text-xs uppercase text-neutral-content"
      >
        <Icon src={Squares2x2} class="h-5 w-5" />
        <span class="text-red-400">Error loading hierarchy</span>
      </div>
      {#if cardCtx.isNewMode && onEditSelection}
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-content/60 transition hover:bg-white/6 hover:text-neutral-content"
          aria-label="Edit map selection"
          onclick={onEditSelection}
        >
          <Icon src={PencilSquare} class="h-4 w-4" />
        </button>
      {:else}
        <Dropdown
          ariaLabel={m.antsy_patient_moth_taste()}
          triggerClass="h-5 w-5 shrink-0 rounded-full border-none bg-transparent p-0 text-neutral-content/60 hover:bg-transparent hover:text-neutral-content"
          triggerIcon={MoreHorizontal}
          triggerIconClass="h-4 w-4"
          contentSide="top"
          contentAlignOffset={-12}
          contentAlign="end"
          items={actionItems}
        />
      {/if}
    </div>
  {/if}
{/if}
