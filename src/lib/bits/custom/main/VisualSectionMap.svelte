<script lang="ts">
import type { MainVisualSectionPaneProps } from './main.types'

let { class: className = '', children }: MainVisualSectionPaneProps = $props()

const rootClass = $derived(
  ['bits-feature-visual__pane', 'bits-feature-visual__pane--map', className]
    .filter(Boolean)
    .join(' '),
)
</script>

<div class={rootClass}>{@render children?.()}</div>
