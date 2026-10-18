<script lang="ts">
import { SectionHeader } from '#lib/bits/custom/index.js'
import { FormFeatureField } from '#lib/bits/patterns/forms/formFeatureField/index.js'
import type { FormFeatureFieldsSectionProps } from './formFeatureFieldsSection.types'

let {
  title,
  subtitle,
  localeKey,
  items,
  columns = 1,
  isEditing = true,
  class: className = '',
}: FormFeatureFieldsSectionProps = $props()

const rootClass = $derived(['flex flex-col gap-4', className].filter(Boolean).join(' '))
const gridClass = $derived(
  [
    'bits-feature-fields__grid',
    columns === 2 ? 'bits-feature-fields__grid--2' : '',
    columns === 3 ? 'bits-feature-fields__grid--3' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<section class={rootClass}>
  {#if title || subtitle}
    <SectionHeader {title} description={subtitle ?? ''} />
  {/if}
  <div class={gridClass}>
    {#each items as item (item.property.id)}
      <FormFeatureField
        property={item.property}
        {localeKey}
        value={item.value}
        checked={item.checked}
        options={item.options}
        isEditing={item.isEditing ?? isEditing}
        onChange={item.onChange}
      />
    {/each}
  </div>
</section>
