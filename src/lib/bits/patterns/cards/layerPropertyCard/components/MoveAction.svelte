<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// BITS
import { Button, SimpleTooltip } from '#lib/bits/core/index.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import ArrowLeft from 'virtual:icons/proicons/arrow-left'
import ArrowRight from 'virtual:icons/proicons/arrow-right'
// TYPES
import type { LayerPropertyCardActionsProps } from '../layerPropertyCard.types'

let {
  isVisible,
  onVisibleChange,
}: Pick<LayerPropertyCardActionsProps, 'isVisible' | 'onVisibleChange'> = $props()

const label = $derived(
  isVisible
    ? m.admin__forms_common_deactivate_field()
    : m.admin__forms_common_activate_field(),
)
</script>

<div
  class="shrink-0"
  in:slide={{ axis: 'x', duration: 180 }}
  out:slide={{ axis: 'x', duration: 150 }}
>
  <SimpleTooltip>
    {#snippet trigger()}
      <Button
        text={label}
        hideLabel={true}
        style="ghost"
        modifier="circle"
        size="sm"
        color={isVisible ? 'neutral' : 'success'}
        iconComponent={isVisible ? ArrowRight : ArrowLeft}
        iconClasses="rotate-90 lg:rotate-0"
        class="h-8 w-8 shrink-0"
        onClick={() => onVisibleChange?.(!isVisible)}
      />
    {/snippet}
    {label}
  </SimpleTooltip>
</div>
