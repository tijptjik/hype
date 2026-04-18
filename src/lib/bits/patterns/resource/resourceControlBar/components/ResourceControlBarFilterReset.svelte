<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
// ICONS
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { ResourceControlBarFilterResetProps } from './resourceControlBarPrimitives.types'

let {
  disabled = false,
  onClick,
  class: className = '',
}: ResourceControlBarFilterResetProps = $props()
</script>

<Button
  text={m.filters__reset()}
  iconComponent={XIcon}
  hideLabel={true}
  style="ghost"
  color="light"
  size="sm"
  modifier="circle"
  class={`bits-resource-filter-bar__reset ${className}`.trim()}
  attrs={{ title: m.filters__reset() }}
  {disabled}
  {onClick}
/>
