<script lang="ts">
import { SectionHeader } from '$lib/bits/custom'
import { FormFeatureField } from '$lib/bits/patterns/forms/formFeatureField'
import type { FormFeatureFieldsSectionProps } from './formFeatureFieldsSection.types'

let {
  title,
  subtitle,
  localeKey,
  items,
  class: className = '',
}: FormFeatureFieldsSectionProps = $props()
</script>

<section class={`bits-feature-fields ${className}`}>
  <SectionHeader {title} description={subtitle ?? ''} />
  {#each items as item (item.property.id)}
    <FormFeatureField
      property={item.property}
      {localeKey}
      value={item.value}
      checked={item.checked}
      options={item.options}
      onChange={item.onChange}
    />
  {/each}
</section>
