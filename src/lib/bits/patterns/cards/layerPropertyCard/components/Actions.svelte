<script lang="ts">
// BITS
import { Switch } from '#lib/bits/custom/index.js'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import MoveAction from './MoveAction.svelte'
// TYPES
import type { LayerPropertyCardActionsProps } from '../layerPropertyCard.types'

let {
  isVisible,
  isUserContributable,
  isContributableDisabled = false,
  isEditing = true,
  showMoveAction = true,
  onVisibleChange,
  onUserContributableChange,
  class: className = '',
}: LayerPropertyCardActionsProps = $props()
</script>

<div
  class={`[&_label]:text-muted-foreground flex shrink-0 items-center gap-3 ${className}`}
>
  <Switch
    checked={isUserContributable}
    disabled={!isEditing || isContributableDisabled}
    topText={m.contributable()}
    size="sm"
    onCheckedChange={value => onUserContributableChange?.(value === true)}
  />
  {#if isEditing && showMoveAction}
    <MoveAction {isVisible} {onVisibleChange} />
  {/if}
</div>
