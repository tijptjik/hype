<script lang="ts">
// COMPONENTS
import SavedFeatureSection from '#lib/bits/patterns/starsPanel/components/SavedFeatureSection.svelte'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { useSavedFeatureListModel } from '#lib/adapters/panels/useSavedFeatureListModel.svelte.js'

let {
  model,
  panel,
}: {
  model: ReturnType<typeof useSavedFeatureListModel>
  panel: PanelProps
} = $props()
</script>

<SavedFeatureSection {model} {panel} kind="visited" />
