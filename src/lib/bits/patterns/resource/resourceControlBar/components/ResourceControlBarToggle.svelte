<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import TriStateToggle from './ResourceControlBarTriStateToggle.svelte'
// TYPES
import type { ResourceControlBarToggleProps } from './resourceControlBarPrimitives.types'

let {
  label,
  tooltip,
  currentValue,
  onToggleFalse,
  onToggleTrue,
  onToggleChange,
  idx = 0,
  falseLabel = m.filters__no(),
  trueLabel = m.filters__has(),
  transformOffset = 16,
  class: className = '',
}: ResourceControlBarToggleProps = $props()

function handleCheckedChange(nextChecked: boolean | null): void {
  if (nextChecked === true) {
    onToggleTrue()
    return
  }

  if (nextChecked === false) {
    onToggleFalse()
    return
  }

  if (currentValue === true) {
    onToggleTrue()
    return
  }

  if (currentValue === false) {
    onToggleFalse()
    return
  }

  onToggleChange(new Event('change'))
}
</script>

<TriStateToggle
  {label}
  {tooltip}
  {currentValue}
  {falseLabel}
  {trueLabel}
  {idx}
  {transformOffset}
  class={className}
  onCheckedChange={handleCheckedChange}
/>
