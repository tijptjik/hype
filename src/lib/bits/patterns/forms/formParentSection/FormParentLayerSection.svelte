<script lang="ts">
// COMPONENTS
import FormParentResourceSection from './components/FormParentResourceSection.svelte'

// TYPES
import type { FormParentLayerSectionProps } from './formParentSection.types'

let {
  hiddenLayerInputAttrs = null,
  onSearchLayers,
  ...props
}: FormParentLayerSectionProps = $props()
</script>

<FormParentResourceSection
  {...props}
  hiddenInputAttrs={hiddenLayerInputAttrs}
  closeOnParentChange={true}
  onSearch={onSearchLayers}
/>
