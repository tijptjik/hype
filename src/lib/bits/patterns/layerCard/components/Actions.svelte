<script lang="ts">
import { Switch } from '$lib/bits/custom'
import type { LayerCardActionsProps } from '../layerCard.types'

let {
  isVisible,
  isUserContributable,
  isEditing = true,
  onVisibleChange,
  onUserContributableChange,
  class: className = '',
}: LayerCardActionsProps = $props()
</script>

<div class={`bits-form__layer-card-actions ${className}`}>
  <Switch
    leftText="Use"
    checked={isVisible}
    disabled={!isEditing}
    size="sm"
    onCheckedChange={value => onVisibleChange?.(value === true)}
  />
  <Switch
    leftText="UGC"
    checked={isUserContributable}
    disabled={!isEditing}
    size="sm"
    onCheckedChange={value => onUserContributableChange?.(value === true)}
  />
</div>
