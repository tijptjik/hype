<script lang="ts">
import { TextInput } from '$lib/bits/custom'

type Props = {
  id: string
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  onChange: (value: string) => void
}

let { id, value = '', placeholder = '', isEditing = true, onChange }: Props = $props()

const resolvedPlaceholder = $derived(isEditing ? placeholder : '—')
</script>

<TextInput
  {id}
  name=""
  label=""
  value={value ?? ''}
  {isEditing}
  placeholder={resolvedPlaceholder}
  class="bits-feature-field__form-field"
  controlClass="bits-feature-field__control-wrap"
  onValueChange={nextValue => onChange(nextValue)}
/>
