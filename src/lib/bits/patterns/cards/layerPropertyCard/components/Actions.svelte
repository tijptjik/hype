<script lang="ts">
import { slide } from 'svelte/transition'
import { Button, SimpleTooltip } from '$lib/bits/core'
import { Switch } from '$lib/bits/custom'
import { m } from '$lib/i18n'
import Inbox from 'virtual:icons/lucide/inbox'
import Plus from 'virtual:icons/lucide/plus'
import X from 'virtual:icons/lucide/x'
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

<div class={`bits-form__layer-card-actions-rail ${className}`}>
  <div class="bits-form__layer-card-actions">
    <div class="bits-form__layer-card-flag">
      <SimpleTooltip>
        {#snippet trigger()}
          <span aria-label="User Contributable">
            <Inbox class="bits-form__layer-card-flag-icon" aria-hidden="true" />
          </span>
        {/snippet}
        User Contributable
      </SimpleTooltip>
      <Switch
        checked={isUserContributable}
        disabled={!isEditing || isContributableDisabled}
        size="sm"
        onCheckedChange={value => onUserContributableChange?.(value === true)}
      />
    </div>
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
          color={isVisible ? 'dark' : 'success'}
          iconComponent={isVisible ? X : Plus}
          class="bits-form__layer-card-action-btn"
          onClick={() => onVisibleChange?.(!isVisible)}
        />
      </div>
    {/if}
  </div>
</div>
