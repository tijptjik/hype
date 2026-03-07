<script lang="ts">
import { Switch } from '$lib/bits/custom'
import { m } from '$lib/i18n'
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
    leftText={m.use()}
    checked={isVisible}
    disabled={!isEditing}
    size="sm"
    onCheckedChange={value => onVisibleChange?.(value === true)}
  />
  <Switch
    leftText={m.contributable()}
    checked={isUserContributable}
    disabled={!isEditing}
    size="sm"
    onCheckedChange={value => onUserContributableChange?.(value === true)}
  />
</div>
