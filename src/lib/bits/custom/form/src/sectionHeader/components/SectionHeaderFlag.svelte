<script lang="ts">
import Switch from '$lib/bits/custom/switch/Switch.svelte'
import type { SectionHeaderFlag } from './types'

let {
  label,
  isNullable = false,
  isEditing,
  isDisplay,
  disabled,
  states,
  leftText,
  ...props
}: SectionHeaderFlag = $props()

const resolvedStatesCount = $derived(states ?? (isNullable ? 3 : 2))
const resolvedLeftText = $derived(label ?? leftText)
const resolvedIsDisplay = $derived(
  isDisplay ?? (isEditing == null ? false : !isEditing),
)
</script>

<Switch
  {...props}
  {disabled}
  isDisplay={resolvedIsDisplay}
  states={resolvedStatesCount}
  leftText={resolvedLeftText}
  size="sm"
  color="light"
/>
