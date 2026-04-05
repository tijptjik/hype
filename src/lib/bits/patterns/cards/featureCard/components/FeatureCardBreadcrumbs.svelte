<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
import MoreHorizontal from 'virtual:icons/lucide/ellipsis'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'

let { feature }: { feature: Feature } = $props()

const appCtx = getAppCtx()
</script>

{#if appCtx.isInitialised}
  {#await appCtx.getHierarchy(feature)}
    <div
      class="pointer-events-auto flex w-full items-center justify-between bg-black px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      <div
        class="flex min-w-0 items-center gap-2 font-mono text-xs uppercase text-neutral-content"
      >
        <Icon src={Squares2x2} class="h-5 w-5" />
        <div class="loading loading-ring loading-xs"></div>
      </div>
      <div
        class="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-content/60"
      >
        <Icon src={MoreHorizontal} class="h-4 w-4" />
      </div>
    </div>
  {:then hierarchy}
    {@const organisationName = appCtx.getContextualOrganisationName(
      hierarchy.organisation!,
      false,
    )}
    {@const projectName = appCtx.getContextualProjectName(hierarchy.project)}
    {@const layerName = appCtx.getContextualLayerName(hierarchy.layer!)}
    <div
      class="pointer-events-auto flex w-full items-center justify-between bg-black px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      <div
        class="flex min-w-0 items-center gap-2 font-mono text-xs uppercase text-neutral-content"
      >
        <Icon src={Squares2x2} class="h-5 w-5 shrink-0" />
        <span class="truncate">{organisationName}</span>
        {#if hierarchy.project && projectName}
          <span class="shrink-0 text-gray-400">›</span>
          <span class="truncate">{projectName}</span>
        {/if}
        {#if hierarchy.layer && layerName}
          <span class="shrink-0 text-gray-400">›</span>
          <span class="hidden truncate w-120:inline">{layerName}</span>
        {/if}
      </div>
      <div
        class="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-content/60"
      >
        <Icon src={MoreHorizontal} class="h-4 w-4" />
      </div>
    </div>
  {:catch _error}
    <div
      class="pointer-events-auto flex w-full items-center justify-between bg-black px-[var(--feature-card-breadcrumbs-padding)] py-[var(--feature-card-content-gap)]"
    >
      <div
        class="flex min-w-0 items-center gap-2 font-mono text-xs uppercase text-neutral-content"
      >
        <Icon src={Squares2x2} class="h-5 w-5" />
        <span class="text-red-400">Error loading hierarchy</span>
      </div>
      <div
        class="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-content/60"
      >
        <Icon src={MoreHorizontal} class="h-4 w-4" />
      </div>
    </div>
  {/await}
{/if}
