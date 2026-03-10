<script lang="ts">
// COMPONENTS
import LayoutModes from '$lib/components/resources/controls/ResourceIndexLayoutModes.svelte'
import ControlModes from '$lib/components/resources/controls/ResourceIndexControlModes.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { NavigableResource } from '$lib/types'
import type { ControlMode } from '$lib/types'

// STATE : CONTEXT
const appCtx = getAppCtx()

// STATE : DERIVED
let headerState = $derived(appCtx.state.header)
let showLayoutModes = $derived(headerState.actions.showLayoutModes)
let showControlModes = $derived(headerState.actions.showControlModes)
let resourceType = $derived(appCtx.headerResourceType as NavigableResource)

// UI state from context
let layoutMode = $derived(
  resourceType ? appCtx.state.ui.layoutMode[resourceType] : 'card',
)
let controlMode = $derived(
  resourceType ? appCtx.state.ui.controlMode[resourceType] : null,
)
let controlModes = $derived(
  (resourceType === 'task' ? ['filter'] : ['filter', 'sort']) as Exclude<
    ControlMode,
    'hidden'
  >[],
)
</script>

{#if showControlModes}
  <ControlModes bind:controlMode defaultMode="filter" modes={controlModes} />
{/if}
{#if showLayoutModes}
  <LayoutModes bind:layoutMode defaultMode="card" />
{/if}
