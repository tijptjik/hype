<script
  lang="ts"
  generics="TItem extends import('./formParentSection.types').ParentSectionItemBase"
>
// COMPONENTS
import FormParentResourceSection from './components/FormParentResourceSection.svelte'

// TYPES
import type { FormParentSectionProps } from './formParentSection.types'

let {
  hiddenInputAttrs = null,
  closeOnParentChange = false,
  onSearch,
  ...props
}: FormParentSectionProps<TItem> = $props()
</script>

<FormParentResourceSection
  {...props}
  {hiddenInputAttrs}
  {closeOnParentChange}
  {onSearch}
/>
