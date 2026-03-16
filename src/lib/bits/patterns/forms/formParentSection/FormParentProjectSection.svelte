<script lang="ts">
// COMPONENTS
import FormParentResourceSection from './components/FormParentResourceSection.svelte'

// TYPES
import type { FormParentProjectSectionProps } from './formParentSection.types'

let {
  hiddenProjectInputAttrs = null,
  onSearchProjects,
  ...props
}: FormParentProjectSectionProps = $props()
</script>

<FormParentResourceSection
  {...props}
  hiddenInputAttrs={hiddenProjectInputAttrs}
  closeOnParentChange={true}
  onSearch={onSearchProjects}
/>
