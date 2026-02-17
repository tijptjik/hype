<script lang="ts">
import type { FormLabelRequiredProps } from '../types'

let {
  required = false,
  requiredSymbol = '*',
  class: className = '',
}: FormLabelRequiredProps = $props()
</script>

<span class={`bits-form__label-required ${className}`}
  >{required ? requiredSymbol : ''}</span
>
