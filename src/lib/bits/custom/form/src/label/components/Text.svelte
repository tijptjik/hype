<script lang="ts">
// BITS
import { Label as BitsLabel } from 'bits-ui'
// STYLES
import { fieldLabelStyles } from '../../../fieldTypography.styles'
// TYPES
import type { FormLabelTextProps } from '../types'

let { for: htmlFor, text, class: className = '' }: FormLabelTextProps = $props()
</script>

<BitsLabel.Root
  for={htmlFor}
  class={`bits-form__label-text ${fieldLabelStyles} ${className}`}
  >{text}</BitsLabel.Root
>
