<script lang="ts">
import { SelectField } from '#lib/bits/custom/index.js'

type Props = {
  id: string
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  options?: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

let {
  id,
  value = '',
  placeholder = '',
  isEditing = true,
  options = [],
  onChange,
}: Props = $props()

const resolvedPlaceholder = $derived(isEditing ? placeholder : '—')
</script>

<SelectField
  {id}
  name=""
  label=""
  items={options.map(option => ({ value: option.value, label: option.label }))}
  value={value ?? ''}
  {isEditing}
  placeholder={resolvedPlaceholder}
  class="bits-feature-field__form-field"
  triggerClass="h-10! rounded-md! bg-transparent! border-border/30 hover:border-border/60 focus-visible:border-primary/70"
  displayClass="bits-feature-field__select-display bg-transparent! border-transparent! shadow-none! ring-0!"
  onValueChange={nextValue => onChange(nextValue)}
/>
