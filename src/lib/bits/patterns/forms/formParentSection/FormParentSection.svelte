<script lang="ts">
// COMPONENTS
import FormParentResourceSection from './components/FormParentResourceSection.svelte'

// TYPES
import type { FormParentSectionProps } from './formParentSection.types'

let {
  hiddenOrganisationInputAttrs = null,
  onSearchOrganisations,
  ...props
}: FormParentSectionProps = $props()
</script>

<FormParentResourceSection
  {...props}
  hiddenInputAttrs={hiddenOrganisationInputAttrs}
  onSearch={onSearchOrganisations}
/>
