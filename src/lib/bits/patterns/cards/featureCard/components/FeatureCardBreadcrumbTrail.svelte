<script lang="ts">
// BITS COMPONENTS
import { Icon } from '#lib/bits/index.js'
// ICONS
import ChevronRight from 'virtual:icons/proicons/chevron-right'
import Squares2x2 from 'virtual:icons/proicons/grid'

let {
  organisationName,
  projectName,
  layerName,
}: {
  organisationName: string | null
  projectName: string | null
  layerName: string | null
} = $props()

type Scope = 'organisation' | 'project' | 'layer'
let expanded = $state<Scope | null>(null)
/**
 * Give one breadcrumb the available width, or restore the compact trail.
 * @param scope - Label selected by pointer or keyboard.
 * @returns Nothing.
 */
function toggle(scope: Scope): void {
  expanded = expanded === scope ? null : scope
}
</script>

<div
  class="text-neutral-content flex min-h-11 min-w-0 flex-1 items-center gap-2 font-mono text-xs uppercase"
  data-feature-breadcrumb-trail
>
  <Icon src={Squares2x2} class="h-5 w-5 shrink-0" />
  {#if organisationName}
    <button
      type="button"
      class={`focus-visible:outline-primary min-h-8 min-w-0 text-left uppercase focus-visible:outline-2 ${expanded && expanded !== 'organisation' ? 'hidden' : ''} ${expanded === 'organisation' ? 'flex-1 break-words whitespace-normal' : 'overflow-hidden text-ellipsis whitespace-nowrap'}`}
      aria-expanded={expanded === 'organisation'}
      onclick={() => toggle('organisation')}
    >
      {organisationName}
    </button>
  {/if}
  {#if projectName}
    {#if organisationName && !expanded}
      <Icon
        src={ChevronRight}
        class="text-neutral-content/55 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
    {/if}
    <button
      type="button"
      class={`focus-visible:outline-primary min-h-8 min-w-0 text-left uppercase focus-visible:outline-2 ${expanded && expanded !== 'project' ? 'hidden' : ''} ${expanded === 'project' ? 'flex-1 break-words whitespace-normal' : 'overflow-hidden text-ellipsis whitespace-nowrap'}`}
      aria-expanded={expanded === 'project'}
      onclick={() => toggle('project')}
    >
      {projectName}
    </button>
  {/if}
  {#if layerName}
    {#if (organisationName || projectName) && (!expanded || expanded === 'layer')}
      <!-- Keep the hidden layer reachable through its visible chevron. -->
      <button
        type="button"
        class="text-neutral-content/55 focus-visible:outline-primary flex min-h-8 w-5 shrink-0 items-center justify-center focus-visible:outline-2"
        aria-label={layerName}
        aria-expanded={expanded === 'layer'}
        onclick={() => toggle('layer')}
        data-layer-disclosure
      >
        <Icon src={ChevronRight} class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    {/if}
    <button
      type="button"
      class={`focus-visible:outline-primary min-h-8 min-w-0 text-left uppercase focus-visible:outline-2 ${expanded === 'layer' ? 'flex-1 break-words whitespace-normal' : expanded ? 'hidden' : organisationName || projectName ? 'w-120:block hidden overflow-hidden text-ellipsis whitespace-nowrap' : 'overflow-hidden text-ellipsis whitespace-nowrap'}`}
      aria-expanded={expanded === 'layer'}
      onclick={() => toggle('layer')}
      data-layer-label
    >
      {layerName}
    </button>
  {/if}
</div>
