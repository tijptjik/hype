<script lang="ts">
// CORE
import { Button } from '$lib/bits/core'
import { cx } from '$lib/bits/utils'
// ICONS
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
// TYPES
import type { FormFacetNavButtonProps } from '../formFacetNav.types'

let { direction, action }: FormFacetNavButtonProps = $props()

const isNext = $derived(direction === 'next')
const iconComponent = $derived(isNext ? ChevronRightIcon : ChevronLeftIcon)
const resolvedAction = $derived(action ?? null)
const buttonClass = $derived(
  cx(
    '[--btn-soft-fg:color-mix(in_oklab,white_70%,transparent)]',
    '[--btn-hover-fg:color-mix(in_oklab,var(--color-light)_84%,white)]',
    '[--btn-active-fg:color-mix(in_oklab,var(--color-light)_72%,white)]',
    'flex-none min-w-max whitespace-nowrap text-[color-mix(in_oklab,var(--color-light)_72%,transparent)]',
    isNext && 'ml-auto flex-row-reverse',
  ),
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
