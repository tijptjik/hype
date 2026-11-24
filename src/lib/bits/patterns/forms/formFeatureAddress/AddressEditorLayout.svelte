<script lang="ts">
// SVELTE
import { onDestroy, type ComponentProps } from 'svelte'
// CONTEXT
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { getSurfaceLayoutCtx } from '#lib/context/surfaceLayout.svelte.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import PanelRightIcon from 'virtual:icons/lucide/panel-right'
// COMPONENTS
import AddressDetails from './AddressDetails.svelte'
import AddressDivisions from './AddressDivisions.svelte'
import { animateAddressMode } from './animateAddressMode.svelte.js'

type DetailProps = ComponentProps<typeof AddressDetails>
type DivisionProps = ComponentProps<typeof AddressDivisions>

let {
  address,
  coordinates,
  isEditing = false,
  translations = $bindable(false),
  independentScroll = false,
  showAddressDetails = true,
  showDivisions = true,
  fallbackWidth = 0,
  readOnlyClass = 'shrink-0 border-t border-border/60 px-6 pt-5 pb-[320px] lg:grid-cols-2 lg:gap-x-10',
  onResolved,
  onChange,
  onDivisionsChange,
  ...details
}: Omit<
  DetailProps,
  | 'splitColumns'
  | 'hasAvailableParts'
  | 'minimumEditorWidth'
  | 'partsOpen'
  | 'partsOverlay'
  | 'onToggleParts'
  | 'coordinates'
> & {
  coordinates: number[]
  showAddressDetails?: boolean
  showDivisions?: boolean
  fallbackWidth?: number
  readOnlyClass?: string
  onResolved?: DivisionProps['onResolved']
  onDivisionsChange?: DivisionProps['onChange']
} = $props()

let hasAvailableParts = $state(true)
const responsive = getResponsiveCtx()
const surfaceLayout = getSurfaceLayoutCtx()
// Surface geometry accounts for open panels; standalone editors use their measured bar.
let editorLayoutWidth = $state(0)
let addressEditor = $state<HTMLDivElement>()
// Capture positions in the owning component before its child markup changes mode.
const addressModeMotion = animateAddressMode(
  () => addressEditor,
  () => isEditing,
)
onDestroy(addressModeMotion.destroy)
let minimumEditorWidth = $state(560)
let partsRequested = $state(true)
let divisionsRequested = $state(true)
let panelPriority = $state<'parts' | 'divisions'>('divisions')
let overlayPanel = $state<'parts' | 'divisions' | null>(null)
const sidePanelWidth = 320
const collapsedPanelWidth = 32
// Retain the header icon inset after the final address part has been selected.
const emptyPartsInset = 40
const availableEditorWidth = $derived(
  editorLayoutWidth ||
    fallbackWidth ||
    surfaceLayout?.getEffectiveAppMainWidth() ||
    responsive.window.width ||
    1280,
)
// Keep a consistent gutter between the sidebar boundaries and the main editor.
const columnGap = $derived(availableEditorWidth < minimumEditorWidth + 192 ? 12 : 32)
// Reserve a usable editor before allowing either side panel to consume its width.
const openPanels = $derived.by(() => {
  // Match the rendered padding, visible column gaps and collapsed rails exactly.
  const budget =
    availableEditorWidth -
    48 -
    (hasAvailableParts ? 0 : emptyPartsInset) -
    columnGap * (Number(hasAvailableParts) + Number(showDivisions)) -
    minimumEditorWidth
  const parts = hasAvailableParts && partsRequested
  const divisions = showDivisions && divisionsRequested
  const preferred =
    panelPriority === 'parts'
      ? { parts, divisions: false }
      : { parts: false, divisions }
  const alternative =
    panelPriority === 'parts'
      ? { parts: false, divisions }
      : { parts, divisions: false }
  return (
    [{ parts, divisions }, preferred, alternative].find(
      candidate =>
        (hasAvailableParts
          ? candidate.parts
            ? sidePanelWidth
            : collapsedPanelWidth
          : 0) +
          (showDivisions
            ? candidate.divisions
              ? sidePanelWidth
              : collapsedPanelWidth
            : 0) <=
        budget,
    ) ?? { parts: false, divisions: false }
  )
})
$effect(() => {
  // Once a requested panel fits inline, later resizing should collapse it to its rail.
  if (overlayPanel && openPanels[overlayPanel]) overlayPanel = null
})
/** Toggle a side panel, giving a newly opened panel first claim on spare width. @param panel Side to toggle. @returns Nothing. */
function togglePanel(panel: 'parts' | 'divisions'): void {
  const opening = !(openPanels[panel] || overlayPanel === panel)
  if (panel === 'parts') partsRequested = opening
  else divisionsRequested = opening
  panelPriority = panel
  // On very narrow surfaces, an explicit toggle overlays the editor instead of squeezing it.
  overlayPanel = opening ? panel : null
}
</script>

<div
  bind:this={addressEditor}
  bind:clientWidth={editorLayoutWidth}
  style:grid-template-columns={isEditing && showAddressDetails
    ? `${hasAvailableParts ? (openPanels.parts ? sidePanelWidth : collapsedPanelWidth) : emptyPartsInset - columnGap}px minmax(0, 1fr)${showDivisions ? ` ${openPanels.divisions ? sidePanelWidth : collapsedPanelWidth}px` : ''}`
    : undefined}
  style:column-gap={isEditing && showAddressDetails ? `${columnGap}px` : undefined}
  class="relative grid w-full min-w-0 max-w-full items-stretch gap-y-8 overflow-visible transition-[grid-template-columns] duration-250 ease-out motion-reduce:transition-none {isEditing &&
  showAddressDetails
    ? independentScroll
      ? 'min-h-0 flex-1 grid-rows-[minmax(0,1fr)] border-t border-border/60 px-6'
      : 'min-h-120 flex-1 border-t border-border/60 px-6'
    : readOnlyClass}"
  data-address-editor-layout
>
  {#if showAddressDetails}
    <AddressDetails
      {...details}
      {address}
      {coordinates}
      {isEditing}
      {independentScroll}
      splitColumns={isEditing}
      bind:translations
      bind:hasAvailableParts
      bind:minimumEditorWidth
      partsOpen={openPanels.parts || overlayPanel === 'parts'}
      partsOverlay={!openPanels.parts && overlayPanel === 'parts'}
      onToggleParts={() => togglePanel('parts')}
      {onChange}
    />
  {/if}
  {#if showDivisions}
    {@const panelOpen =
      !isEditing ||
      !showAddressDetails ||
      openPanels.divisions ||
      overlayPanel === 'divisions'}
    <div
      class="relative flex min-w-0 flex-col {independentScroll
        ? 'min-h-0'
        : ''} {isEditing && showAddressDetails && overlayPanel !== 'divisions'
        ? '-mr-6 overflow-clip pr-6'
        : ''}"
      data-address-divisions-panel
    >
      {#if isEditing && showAddressDetails}
        <button
          type="button"
          inert={panelOpen}
          aria-hidden={panelOpen}
          aria-label={m.address_divisions_show()}
          data-tooltip={m.address_divisions_show()}
          aria-expanded="false"
          class="border-border bg-panel text-muted-foreground hover:text-primary absolute top-5 right-0 flex w-8 flex-col items-center gap-3 rounded-md border py-3 transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none {panelOpen
            ? 'invisible translate-x-2 opacity-0'
            : 'visible flex-1 translate-x-0 opacity-100'}"
          onclick={() => togglePanel('divisions')}
        >
          <PanelRightIcon class="size-4" />
          <span class="text-xs font-medium [writing-mode:vertical-rl]"
            >{m.feature_address_divisions()}</span
          >
        </button>
      {/if}
      <!-- Keep the resolved geography mounted and its text width stable while the track expands. -->
      <div
        class="{independentScroll
          ? 'min-h-0 overflow-y-auto overscroll-contain'
          : ''} transition-[opacity,transform,visibility] duration-250 ease-out motion-reduce:transition-none {panelOpen
          ? 'visible flex-1 translate-x-0 opacity-100'
          : 'invisible absolute top-5 right-0 translate-x-3 opacity-0'} {!openPanels.divisions &&
        overlayPanel === 'divisions'
          ? 'border-border bg-panel absolute top-3 right-0 z-30 w-72 rounded-lg border p-3 shadow-lg'
          : isEditing && showAddressDetails
            ? 'border-border/60 bg-muted/20 -mr-6 w-86 border-l px-4 pt-2 pb-5 pr-6'
            : ''}"
        inert={!panelOpen}
        aria-hidden={!panelOpen}
      >
        <AddressDivisions
          sidebar={isEditing && showAddressDetails}
          compact={editorLayoutWidth < 1100}
          stacked={true}
          onToggle={isEditing && showAddressDetails
            ? () => togglePanel('divisions')
            : undefined}
          {onResolved}
          class="border-t-0! pt-0!"
          {address}
          {coordinates}
          {isEditing}
          onChange={onDivisionsChange ?? onChange}
        />
      </div>
    </div>
  {/if}
</div>
