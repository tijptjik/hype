<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import XMark from 'virtual:icons/lucide/x'
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { navigateOnAdminById } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Id, PanelProps } from '$lib/types'
// COMPONENTS
import ItemResource from './ItemResource.svelte'

const appCtx = getAppCtx()

type Props = {
  resourceType: FirstClassResource | 'neighbourhood'
  resources: Array<{
    id: Id | string
    i18n?: Record<string, unknown> | null
  }>
  selectedIds: Id[] | string[]
  colorClass?: string
} & PanelProps

let props: Props = $props()

const DEFAULT_RESOURCE_COLOR_CLASSES = {
  colorClass: 'text-blue-400',
  hoverColorClass: 'hover:brightness-80',
  selectedClass: 'bg-base-content/60',
} as const

const RESOURCE_COLOR_CLASSES: Record<
  Props['resourceType'],
  {
    colorClass: string
    hoverColorClass: string
    selectedClass: string
  }
> = {
  organisation: {
    colorClass: 'text-primary',
    hoverColorClass: 'hover:text-primary/80',
    selectedClass: 'bg-primary',
  },
  project: {
    colorClass: 'text-accent',
    hoverColorClass: 'hover:text-accent/80',
    selectedClass: 'bg-accent',
  },
  layer: {
    colorClass: 'text-secondary',
    hoverColorClass: 'hover:text-secondary/80',
    selectedClass: 'bg-secondary',
  },
  neighbourhood: {
    colorClass: 'text-emerald-600',
    hoverColorClass: 'hover:text-emerald-600/80',
    selectedClass: 'bg-emerald-600',
  },
}

let resourceColorClasses = $derived(
  RESOURCE_COLOR_CLASSES[props.resourceType] ?? DEFAULT_RESOURCE_COLOR_CLASSES,
)
let colorClass = $derived(props.colorClass ?? resourceColorClasses.colorClass)
let hoverColorClass = $derived(
  props.colorClass
    ? DEFAULT_RESOURCE_COLOR_CLASSES.hoverColorClass
    : resourceColorClasses.hoverColorClass,
)
let selectedClass = $derived(
  props.colorClass
    ? DEFAULT_RESOURCE_COLOR_CLASSES.selectedClass
    : resourceColorClasses.selectedClass,
)

function handleToggle(id: Id): void {
  if (props.resourceType !== 'neighbourhood') {
    appCtx.togglePrism(props.resourceType as FirstClassResource, id)
  }
}

const handleClickOnNarrow = async (id: string, event: MouseEvent): Promise<void> => {
  event.stopPropagation()

  if (!props.resourceType || !props.adminCtx) return

  const isCurrentActive = id === props.active?.resourceId
  const isInPrism = props.selectedIds.includes(id)

  if (isInPrism && isCurrentActive) {
    appCtx.togglePrism(props.resourceType as FirstClassResource, id)
    return
  }

  await navigateOnAdminById(
    props.adminCtx,
    props.resourceType as FirstClassResource,
    id,
  )
}

function getNoneSelectedMessage(currentProps: Props): string {
  if (currentProps.resourceType === 'layer') {
    const baseMsg = m.maps__layers_none()
    const subMsg = m.maps__layers_none_subline()
    return `${baseMsg} ${currentProps.isAdmin ? '' : subMsg}`
  }

  if (
    currentProps.resourceType === 'project' &&
    appCtx.state.prisms.organisation.length === 0
  ) {
    return m.maps__projects_none()
  }

  if (
    currentProps.resourceType === 'project' &&
    appCtx.state.prisms.organisation.length > 0
  ) {
    return m.maps__projects_none_with_n_organisations({
      n: appCtx.state.prisms.organisation.length.toString(),
    })
  }

  if (currentProps.resourceType === 'neighbourhood') {
    return m.maps__neighbourhoods_none()
  }

  return m.maps__organisations_none()
}

let resourcesToDisplay = $derived([...props.selectedIds])
let shouldShowEmptyState = $derived(
  resourcesToDisplay.length === 0 &&
    !['organisation', 'project', 'layer'].includes(props.resourceType),
)
</script>

<div
  class="bits-theme bits-panel-selected-resource"
  class:bits-panel-selected-resource--narrow={props.isNarrow}
>
  <div class="bits-panel-selected-resource__stack">
    <div
      class="bits-panel-selected-resource__state bits-panel-selected-resource__state--wide"
      data-active={!props.isNarrow}
      aria-hidden={props.isNarrow}
    >
      <div class="bits-panel-selected-resource__wide-list">
        {#each resourcesToDisplay as id (id)}
          {@const resource = props.resources.find((item) => item.id === id)}
          {@const name = resource
            ? getI18n(resource.i18n ?? undefined, 'nameShort', appCtx.getUserPreferences())
            : id}
          <button
            type="button"
            class="bits-panel-selected-resource__wide-chip {colorClass} {hoverColorClass}"
            onclick={(event) => {
              event.stopPropagation()
              handleToggle(id)
            }}
          >
            <span class="bits-panel-selected-resource__wide-chip-label">{name}</span>
            <Icon
              size="lg"
              src={XMark}
              class="bits-panel-selected-resource__wide-chip-icon"
            />
          </button>
        {/each}
      </div>

      {#if shouldShowEmptyState}
        <div class="bits-panel-selected-resource__empty">
          <p class="bits-panel-selected-resource__empty-text">
            {@html getNoneSelectedMessage(props)}
          </p>
        </div>
      {/if}
    </div>

    <div
      class="bits-panel-selected-resource__state bits-panel-selected-resource__state--narrow"
      data-active={props.isNarrow}
      aria-hidden={!props.isNarrow}
    >
      <div class="bits-panel-selected-resource__narrow-list">
        {#each resourcesToDisplay as id (id)}
          {@const resource = props.resources.find((item) => item.id === id)}
          {#if resource}
            <ItemResource
              panelType={props.panelType}
              position={props.position}
              scrollable={props.scrollable}
              inline={props.inline}
              isNarrow={true}
              isAdmin={props.isAdmin}
              active={props.active}
              adminCtx={props.adminCtx}
              resourceType={props.resourceType}
              {resource}
              {selectedClass}
              isSelected={props.selectedIds.includes(id)}
              onNavigate={(event) => {
                if (event instanceof MouseEvent) {
                  handleClickOnNarrow(id, event)
                }
              }}
              onToggle={(event) => {
                event.stopPropagation()
                handleToggle(id as Id)
              }}
            />
          {/if}
        {/each}
      </div>
    </div>
  </div>
</div>
