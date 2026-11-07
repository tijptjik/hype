<script lang="ts">
// COMPONENTS
import FormProjectLayersSection from '#lib/bits/patterns/forms/formProjectLayersSection/FormProjectLayersSection.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
// TYPES
import type { FormProjectLayersSectionItem } from '#lib/bits/patterns/forms/formProjectLayersSection/formProjectLayersSection.types.js'

let items = $state<FormProjectLayersSectionItem[]>([
  { id: 'open', projectNameShort: '', layerName: 'Open', isDefaultVisible: true },
  {
    id: 'closed',
    projectNameShort: '',
    layerName: 'Permanently Closed',
    isDefaultVisible: false,
  },
])
let editing = $state(true)
let moves = $state(0)

/** Apply the project's remove-then-insert form ordering contract.
 * @param sourceId Layer being moved.
 * @param targetId Layer occupying the destination index.
 * @returns Nothing after updating the displayed form projection.
 */
function move(sourceId: string, targetId: string): void {
  const source = items.findIndex(item => item.id === sourceId)
  const target = items.findIndex(item => item.id === targetId)
  if (source < 0 || target < 0 || source === target) return
  const next = [...items]
  const [item] = next.splice(source, 1)
  if (!item) return
  next.splice(target, 0, item)
  items = next
  moves++
}
</script>
<main class="bits-theme bg-background text-foreground min-h-screen">
  <button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
  <FormSurface class={resourceTabsStyles}>
    <FormProjectLayersSection
      title="Layer Order"
      subtitle="Drag layers to control project order and choose default visibility."
      {items}
      isEditing={editing}
      onMove={move}
      onToggleDefault={(id, value) =>
        (items = items.map(item =>
          item.id === id ? { ...item, isDefaultVisible: value } : item,
        ))}
    />
  </FormSurface>
  <output data-testid="layer-order"
    >{JSON.stringify(
      items.map((item, rank) => ({
        id: item.id,
        rank,
        isDefaultVisible: item.isDefaultVisible,
      })),
    )}</output
  >
  <output data-testid="moves">{moves}</output>
</main>
