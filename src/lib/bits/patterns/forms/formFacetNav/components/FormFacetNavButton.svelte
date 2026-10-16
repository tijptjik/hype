<script lang="ts">
// CORE
import { Button } from '#lib/bits/core/index.js'
import { cx } from '#lib/bits/utils.js'
// ICONS
import ChevronLeftIcon from 'virtual:icons/proicons/chevron-left'
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'
// TYPES
import type { FormFacetNavButtonProps } from '../formFacetNav.types'

let { direction, action }: FormFacetNavButtonProps = $props()

const isNext = $derived(direction === 'next')
const iconComponent = $derived(isNext ? ChevronRightIcon : ChevronLeftIcon)
const resolvedAction = $derived(action ?? null)
const buttonClass = $derived(
  cx('flex-none min-w-max whitespace-nowrap', isNext && 'ml-auto flex-row-reverse'),
)
</script>

<Button
  text={resolvedAction?.text ?? ''}
  {iconComponent}
  color="primary"
  style="soft"
  size="sm"
  class={buttonClass}
  disabled={resolvedAction?.disabled ?? false}
  onClick={resolvedAction?.onClick}
/>
