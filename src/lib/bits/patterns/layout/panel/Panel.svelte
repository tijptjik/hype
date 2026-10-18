<script lang="ts">
// COMPONENTS
import PanelRoot from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'

const appCtx = getSurfaceCtx()

// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

let {
  children,
  panelContainer = $bindable(),
  position = 'right',
  scrollable = true,
  inline = false,
  isAdmin = false,
  isNarrow = false,
  ...panelProps
}: PanelProps & {
  children: import('svelte').Snippet
  panelContainer?: HTMLDivElement
} & PanelProps = $props()

// Panel visibility logic stays with the surface; shared chrome owns geometry and transitions.
const isOpen = $derived(
  appCtx.panels.isPanelOpen(panelProps.panelType) ||
    appCtx.panels.isPanelOpenVisually(panelProps.panelType),
)
</script>

<PanelRoot
  {isOpen}
  {position}
  {scrollable}
  {inline}
  {isAdmin}
  {isNarrow}
  bind:panelContainer
  {...panelProps}
>
  {@render children()}
</PanelRoot>
