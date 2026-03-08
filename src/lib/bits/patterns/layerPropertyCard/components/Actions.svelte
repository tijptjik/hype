<script lang="ts">
import { Switch } from '$lib/bits/custom'
import { m } from '$lib/i18n'
import type { LayerPropertyCardActionsProps } from '../layerPropertyCard.types'

let {
  isVisible,
  isUserContributable,
  isEditing = true,
  onVisibleChange,
  onUserContributableChange,
  class: className = '',
}: LayerPropertyCardActionsProps = $props()
</script>

<div class={`bits-form__layer-card-actions-rail ${className}`}>
  <div class="bits-form__layer-card-actions">
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
</div>
