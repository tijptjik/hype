<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
import { tick } from 'svelte';
import Portal from 'svelte-portal';
// I18N
import { getI18n } from '$lib/i18n';
// ICONS
import { Funnel, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// COMPONENTS
import ResourceDisplay from '../elements/ResourceDisplay.svelte';
import ResourceHierarchyPath from '../common/ResourceHierarchyPath.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// SERVICES
import { getHoverColor } from '$lib/utils/colours';
// ENUMS
import type { FirstClassResource } from '$lib/enums';
// TYPES
import type {
  Resource,
  PanelProps,
  Organisation,
  Neighbourhood,
  Project,
  Layer
} from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// PROPS
const {
  resourceType,
  resource,
  hierarchy = {},
  selectedClass = 'bg-blue-400',
  isSelected,
  onNavigate,
  onToggle,
  ...panelProps
}: {
  resourceType: FirstClassResource;
  resource: Resource;
  hierarchy?: { organisation?: any; project?: any; layer?: any };
  selectedClass?: string;
  isSelected: boolean;
  onToggle: (e: MouseEvent | KeyboardEvent) => void;
  onNavigate?: (e: MouseEvent | KeyboardEvent) => void;
} & PanelProps = $props();

let bgHoverClass = $derived(getHoverColor(selectedClass.replace('bg-', 'text-')));

let name = $derived(
  getI18n(
    resource as Organisation | Project | Layer | Neighbourhood,
    'name',
    appCtx.getUserPreferences()
  )
);
let isCurrentActive = $derived(
  panelProps.active?.resourceId === resource.id &&
    panelProps.active?.resourceType === resourceType
);

// ELEMENTS
let Button: HTMLDivElement;
// Generate a unique id for the button for anchor
let buttonId = `popover-btn-${Math.random().toString(36).slice(2)}`;
let toolTipActive = $state(false);
let tooltipPosition = $state({ left: 0, top: 0, width: 0, height: 0 });

// FUNCTIONS
function showTooltip() {
  if (Button && panelProps.isNarrow) {
    toolTipActive = true;
    tick().then(() => {
      const rect = Button.getBoundingClientRect();
      tooltipPosition = {
        left: rect.right,
        top: rect.top + rect.height / 2 - 16,
        width: rect.width,
        height: rect.height
      };
    });
  }
}
function hideTooltip() {
  toolTipActive = false;
}
</script>

<div
  bind:this={Button}
  id={buttonId}
  class="group flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 text-base-content caret-transparent transition-colors duration-200 focus:outline-none focus:ring-0 {panelProps.isNarrow
    ? ''
    : 'pl-8 pr-4'}"
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
  onclick={panelProps.isAdmin ? onNavigate : onToggle}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      panelProps.isAdmin ? onNavigate?.(e) : onToggle(e);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      // Find the nearest section ancestor and focus its input
      const section = e.currentTarget.closest('section');
      const input = section?.querySelector('input');
      input?.focus();
    }
  }}
  tabindex="0">
  <div
    class="group flex items-center gap-3 {panelProps.isNarrow
      ? 'h-6 w-full justify-center'
      : '-translate-x-5 flex-row'} "
    onmouseenter={showTooltip}
    onmouseleave={hideTooltip}
    onfocus={showTooltip}
    onblur={hideTooltip}>
    {#if panelProps.isNarrow && isCurrentActive && isSelected}
      <Icon
        src={XMark}
        class="h-6 w-6 {selectedClass.replace('bg-', 'text-')}"
        aria-hidden="true"
        onclick={onToggle} />
    {:else}
      <div
        onclick={panelProps.isNarrow ? onNavigate : onToggle}
        class="h-2 w-2 rounded-full group-hover:{isSelected
          ? bgHoverClass
          : 'bg-base-content/30'} group-focus-visible:{isSelected
          ? bgHoverClass
          : 'bg-base-content/30'}
      {isSelected ? selectedClass : ''} {panelProps.isNarrow && !isSelected
          ? 'outline outline-2 outline-offset-2'
          : ''} {isCurrentActive
          ? 'outline-white group-hover:scale-[160%] group-hover:outline-1 group-hover:outline-offset-0'
          : 'outline-base-content/30'} {isCurrentActive
          ? 'group-hover:' + bgHoverClass
          : ''}">
      </div>
    {/if}
    {#if !panelProps.isNarrow}
      <div class="flex flex-col items-start gap-0">
        <ResourceHierarchyPath {hierarchy} />
        <p
          class="whitespace-nowrap font-light {isCurrentActive
            ? selectedClass.replace('bg-', 'text-')
            : ''}">
          {name}
        </p>
      </div>
    {/if}
  </div>
  {#if !panelProps.isNarrow}
    <div
      class="text-sm text-base-content/20 group-hover:text-base-content/40 group-focus-visible:text-base-content/40"
      onclick={onToggle}>
      <Icon src={isSelected ? XMark : Funnel} class="h-6 w-6 " aria-hidden="true" />
    </div>
  {/if}
</div>
{#if toolTipActive}
  <Portal target="body">
    <div
      transition:slide={{ duration: 200, axis: 'x' }}
      class="pointer-events-auto fixed z-50 min-h-4 min-w-10 whitespace-nowrap rounded-r-md bg-black px-3 py-2 text-center text-sm text-base-content"
      style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px; ">
      {name}
    </div>
  </Portal>
{/if}
