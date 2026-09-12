<script lang="ts">
import * as LabelPrimitive from './components'
import type { FormLabelProps } from './types'

let {
  for: htmlFor,
  text,
  required = false,
  isEditing = true,
  issues,
  class: className = '',
  textClass = '',
  requiredClass = '',
  errorClass = '',
}: FormLabelProps = $props()
</script>

<div class={`bits-form__label ${className}`}>
  <div class="flex items-start gap-1">
    <span class="inline-flex items-start gap-0.5">
      <LabelPrimitive.Text for={htmlFor} {text} class={textClass} />
      <LabelPrimitive.Required {required} {isEditing} class={requiredClass} />
    </span>
  </div>
  <LabelPrimitive.Error {issues} class={errorClass} />
</div>
