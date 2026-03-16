<script lang="ts">
import HiddenInput from '$lib/bits/utilities/HiddenInput.svelte'
import { Swap } from '$lib/bits/custom'
import { useId } from 'bits-ui'
import type { SwapFieldProps } from './swapField.types'

const generatedId = useId()

let {
  checked = $bindable(false),
  disabled = false,
  required = false,
  name,
  value = 'on',
  id = generatedId,
  onIcon,
  offIcon,
  size = 'md',
  onColor = 'primary',
  offColor = 'neutral',
  label = '',
  class: className = '',
  onCheckedChange,
}: SwapFieldProps = $props()

function handleCheckedChange(nextChecked: boolean): void {
  checked = nextChecked
  onCheckedChange?.(nextChecked)
}
</script>

<div class={['bits-swap-field', className].filter(Boolean).join(' ')}>
  <HiddenInput type="checkbox" {checked} {disabled} {required} {name} {value} {id} />
  <Swap
    {checked}
    {disabled}
    {onIcon}
    {offIcon}
    {size}
    {onColor}
    {offColor}
    {label}
    onCheckedChange={handleCheckedChange}
  />
</div>
