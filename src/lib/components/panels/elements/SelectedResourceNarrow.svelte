<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { tick } from 'svelte'
import Portal from 'svelte-portal'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { XMark } from '@steeze-ui/heroicons'
// UTILS
import { getBgColor, getHoverColor, getHoverTextColor } from '$lib/utils/colours'
// SVELTE
import { createEventDispatcher } from 'svelte'

// PROPS
let props = $props()

// DERIVED VALUES
let colorClass = $derived(props.colorClass ?? 'text-blue-400')

// CONTEXT
const dispatch = createEventDispatcher()

// ELEMENTS
let Button: HTMLButtonElement
// Generate a unique id for the button for anchor
let buttonId = `popover-btn-${Math.random().toString(36).slice(2)}`
let toolTipActive = $state(false)
let tooltipPosition = $state({ left: 0, top: 0, width: 0, height: 0 })

// FUNCTIONS
function showTooltip() {
  if (Button) {
    toolTipActive = true
    tick().then(() => {
      const rect = Button.getBoundingClientRect()
      tooltipPosition = {
        left: rect.right + 8,
        top: rect.top + rect.height / 2 - 16,
        width: rect.width,
        height: rect.height,
      }
    })
  }
}
function hideTooltip() {
  toolTipActive = false
}
</script>

<button
  bind:this={Button}
  id={buttonId}
  class="group absolute inset-0 flex h-full w-full items-center justify-center transition-colors hover:bg-base-300/20"
  style="z-index:2"
  transition:slide={{ duration: 300, axis: 'y' }}
  onmouseenter={showTooltip}
  onmouseleave={hideTooltip}
  onfocus={showTooltip}
  onblur={hideTooltip}
  onclick={(e) => dispatch('click', e)}
>
  {#if props.isCurrentActive && props.isSelected}
    <!-- Current active item in prism: show cross on hover, colored circle otherwise -->
    <div
      class="h-6 w-6 stroke-2 font-bold {colorClass} group-hover:{getHoverTextColor(
        colorClass
      )}"
    >
      <Icon name="close" src={XMark} class="h-6 w-6" strokeWidth={4} />
    </div>
  {:else if props.isCurrentActive}
    <!-- Current active item NOT selected: show cross on hover, colored circle otherwise -->
    <div
      class="h-2 w-2 rounded-full font-bold outline outline-2 outline-offset-2 outline-white group-hover:{getHoverColor(
        colorClass
      )} outline-white group-hover:scale-[160%] group-hover:outline-1 group-hover:outline-offset-0"
    ></div>
  {:else}
    <!-- Prism item not current: show colored circle -->
    <div
      class="h-2 w-2 rounded-full {getBgColor(colorClass)} group-hover:{getHoverColor(
        colorClass
      )}"
    ></div>
  {/if}
</button>

{#if toolTipActive}
  <Portal target="body">
    <div
      transition:slide={{ duration: 200, axis: 'x' }}
      class="pointer-events-auto fixed z-50 min-h-4 min-w-10 whitespace-nowrap rounded-r-md bg-black px-3 py-2 text-center text-sm text-base-content"
      style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px; "
    >
      {props.name}
    </div>
  </Portal>
{/if}
