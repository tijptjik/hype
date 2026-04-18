<script lang="ts">
import { Label as BitsLabel } from 'bits-ui'
import type { FormLabelTextProps } from '../types'

let { for: htmlFor, text, class: className = '' }: FormLabelTextProps = $props()
</script>

<BitsLabel.Root for={htmlFor} class={`bits-form__label-text ${className}`}
  >{text}</BitsLabel.Root
>
