<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { Switch } from '#lib/bits/custom/index.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import Plus from 'virtual:icons/proicons/add'
import X from 'virtual:icons/proicons/cancel'
// TYPES
import type { LayerPropertyCardActionsProps } from '../layerPropertyCard.types'

let {
  isVisible,
  isUserContributable,
  isContributableDisabled = false,
  isEditing = true,
  onVisibleChange,
  onUserContributableChange,
  class: className = '',
}: LayerPropertyCardActionsProps = $props()
</script>

<div
  class={`flex shrink-0 items-center gap-3 [&_label]:text-muted-foreground ${className}`}
>
  <Switch
    checked={isUserContributable}
    disabled={!isEditing || isContributableDisabled}
    topText={m.contributable()}
    size="sm"
    onCheckedChange={value => onUserContributableChange?.(value === true)}
  />
  {#if isEditing}
    <div
      in:slide={{ axis: 'x', duration: 180 }}
      out:slide={{ axis: 'x', duration: 150 }}
    >
      <Button
        text={isVisible ? m.admin__forms_common_remove() : m.use()}
        hideLabel={true}
        style="ghost"
        modifier="circle"
        size="sm"
        color={isVisible ? 'neutral' : 'success'}
        iconComponent={isVisible ? X : Plus}
        class={isVisible ? 'w-8 h-8 shrink-0 text-foreground' : 'w-8 h-8 shrink-0'}
        onClick={() => onVisibleChange?.(!isVisible)}
      />
    </div>
  {/if}
</div>
