<script lang="ts">
// SVELTE
import { onDestroy, tick, type Snippet } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import ShrinkIcon from 'virtual:icons/proicons/full-screen-minimize'

let {
  label,
  children,
  onResize,
  onExpandedChange,
}: {
  label: string
  children: Snippet<[boolean]>
  onResize?: () => void
  onExpandedChange?: (expanded: boolean) => void
} = $props()
let expanded = $state(false)
let changing = $state(false)
let home: HTMLDivElement
let stage: HTMLElement
let dialog: HTMLDialogElement
let toggle: HTMLButtonElement
const componentId = $props.id()
const transitionName = `location-map-${componentId.replace(/[^a-zA-Z0-9-]/g, '')}`

/** Move the existing map into the top layer while preserving its camera and renderer.
 * @param next Requested expanded state.
 * @returns Completion after the visual transition and focus restoration.
 */
async function setExpanded(next: boolean): Promise<void> {
  if (changing || expanded === next) return
  changing = true
  stage.style.viewTransitionName = transitionName
  const update = async (): Promise<void> => {
    expanded = next
    if (next) {
      dialog.append(stage)
      dialog.showModal()
    } else {
      home.append(stage)
      dialog.close()
    }
    onExpandedChange?.(next)
    await tick()
    onResize?.()
    toggle?.focus({ preventScroll: true })
  }
  try {
    if (document.startViewTransition && !prefersReducedMotion.current)
      await document.startViewTransition(update).finished
    else await update()
  } catch {
    // Interrupted visual transitions leave the completed DOM update intact.
  } finally {
    if (stage) stage.style.viewTransitionName = ''
    changing = false
    await tick()
    toggle?.focus({ preventScroll: true })
  }
}

// Restore Svelte's original DOM ownership before route teardown removes the nodes.
onDestroy(() => {
  if (stage && home && stage.parentElement !== home) home.append(stage)
  dialog?.close()
})
</script>

<div bind:this={home} class="relative h-full min-h-0 min-w-0">
  <section
    bind:this={stage}
    aria-label={label}
    class="bg-panel relative h-full w-full overflow-hidden"
    data-expanded-map={expanded ? label : undefined}
  >
    {@render children(expanded)}
    <button
      bind:this={toggle}
      type="button"
      class="border-border bg-panel text-primary absolute bottom-3 left-3 z-40 flex size-10 items-center justify-center rounded-lg border shadow-sm focus-visible:outline-2"
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={expanded}
      disabled={changing}
      onclick={() => void setExpanded(!expanded)}
    >
      {#if expanded}
        <ShrinkIcon class="size-5" />
      {:else}
        <ExpandIcon class="size-5" />
      {/if}
    </button>
  </section>
</div>
<dialog
  bind:this={dialog}
  aria-label={label}
  class="bg-panel fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none border-0 p-0 backdrop:bg-black/40"
  oncancel={event => {
    event.preventDefault()
    void setExpanded(false)
  }}
></dialog>
