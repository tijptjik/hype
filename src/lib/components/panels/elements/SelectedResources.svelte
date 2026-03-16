<script lang="ts">
// TRANSITIONS
import { fade } from 'svelte/transition'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { XMark } from '@steeze-ui/heroicons'
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { navigateOnAdminById } from '$lib/navigation'
// COMPONENTS
import ResourceButton from './SelectedResourceNarrow.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Resource, Id, NeighbourhoodResource, PanelProps } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()

type Props = {
  resourceType: FirstClassResource | 'neighbourhood'
  resources: Exclude<Resource, 'task' | 'hub'>[] | NeighbourhoodResource[]
  selectedIds: Id[] | string[]
  colorClass?: string
} & PanelProps

// First, get the props without destructuring
let props: Props = $props()

// Then reference props directly or create derived values if needed
let colorClass = $derived(props.colorClass ?? 'text-blue-400')

function handleToggle(id: Id) {
  if (props.resourceType !== 'neighbourhood') {
    appCtx.togglePrism(props.resourceType as FirstClassResource, id)
  }
}

// Handle narrow mode circle interactions
const handleClickOnNarrow = async (id: string, e: MouseEvent) => {
  e.stopPropagation()
  if (!props.resourceType) return

  const isCurrentActive = id === props.active?.resourceId
  const isInPrism = props.selectedIds.includes(id)

  if (isInPrism && isCurrentActive) {
    appCtx.togglePrism(props.resourceType as FirstClassResource, id)
  } else
    await navigateOnAdminById(
      props.adminCtx!,
      props.resourceType as FirstClassResource,
      id,
    )
}

function getNoneSelectedMessage(props: Props) {
  if (props.resourceType == 'layer') {
    const baseMsg = m.maps__layers_none()
    const subMsg = m.maps__layers_none_subline()
    return `${baseMsg} ${props.isAdmin ? '' : subMsg}`
  } else if (
    props.resourceType == 'project' &&
    appCtx.state.prisms.organisation.length == 0
  ) {
    return m.maps__projects_none()
  } else if (
    props.resourceType == 'project' &&
    appCtx.state.prisms.organisation.length > 0
  ) {
    return m.maps__projects_none_with_n_organisations({
      n: appCtx.state.prisms.organisation.length.toString(),
    })
  } else if (props.resourceType == 'neighbourhood') {
    return m.maps__neighbourhoods_none()
  } else {
    return m.maps__organisations_none()
  }
}

let resourcesToDisplay = $derived([
  ...props.selectedIds,
  ...(props.active?.resourceId &&
  !props.selectedIds.includes(props.active.resourceId) &&
  props.active.resourceType == props.resourceType
    ? [props.active.resourceId]
    : []),
])
</script>

<div
  class="flex {props.isNarrow
    ? 'flex-col items-center justify-center gap-1 px-2'
    : 'mb-0 flex-wrap items-start gap-x-0 gap-y-2 overflow-visible px-8 pt-2 pb-4'}"
>
  {#each resourcesToDisplay as id (id)}
    {@const isCurrentActive = id === props.active?.resourceId}
    {@const resource = props.resources.find((r) => r.id === id)}
    {@const name = getI18n(resource!.i18n, 'nameShort', appCtx.getUserPreferences())}
    <div
      class="relative {props.isNarrow ? 'h-12 w-12 shrink-0' : 'min-w-0 max-w-full self-start'}"
    >
      {#if !props.isNarrow}
        <button
          type="button"
          class="inline-grid h-auto w-fit max-w-full cursor-pointer grid-cols-[minmax(0,max-content)_auto] items-center gap-x-2 rounded-full border border-current/20 bg-transparent px-3 py-1.5 text-left leading-tight {colorClass}"
          transition:fade={{ duration: 300 }}
          onclick={(e) => {
            e.stopPropagation();
            handleToggle(id);
          }}
        >
          <span
            class="min-w-0 justify-self-start whitespace-normal break-words leading-tight"
          >
            {name}
          </span>
          <Icon src={XMark} class="h-3 w-3 shrink-0 self-center" />
        </button>
      {/if}
      {#if props.isNarrow}
        <ResourceButton
          {resource}
          {colorClass}
          {isCurrentActive}
          isSelected={props.selectedIds.includes(id)}
          {id}
          {name}
          onclick={(e: MouseEvent) => handleClickOnNarrow(id, e)}
        />
      {/if}
    </div>
  {/each}
</div>
{#if !props.isNarrow && resourcesToDisplay.length == 0}
  <div class="flex flex-wrap justify-start gap-2 px-[34px]">
    <p class="pb-2 text-sm text-base-content/60">
      {@html getNoneSelectedMessage(props)}
    </p>
  </div>
{/if}
