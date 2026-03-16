<script lang="ts">
// CORE
import { Button } from '$lib/bits/core'
// ICONS
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
// TYPES
import type { FormFacetNavButtonProps } from '../formFacetNav.types'

let { direction, action }: FormFacetNavButtonProps = $props()

const isNext = $derived(direction === 'next')
const iconComponent = $derived(isNext ? ChevronRightIcon : ChevronLeftIcon)
const buttonClass = $derived(
  [
    'bits-feature-editor__facet-nav-button',
    isNext ? 'bits-feature-editor__facet-nav-button--next' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<Button
  text={action.text}
  {iconComponent}
  color="dark"
  style="ghost"
  size="sm"
  class={buttonClass}
  disabled={action.disabled ?? false}
  onClick={action.onClick}
/>
