<script lang="ts">
import { slide } from 'svelte/transition'
import { Button, SimpleTooltip } from '#lib/bits/core/index.js'
import { Card, Switch } from '#lib/bits/custom/index.js'
import { m } from '#lib/i18n.js'
import Inbox from 'virtual:icons/proicons/archive'
import Plus from 'virtual:icons/proicons/add'
import X from 'virtual:icons/proicons/cancel'
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

<Card.Actions
  padding="md"
  bg="subtle"
  class={`bits-form__layer-card-actions-rail ${className}`}
>
  <div class="bits-form__layer-card-actions">
    <div class="flex items-center gap-2.5">
      <SimpleTooltip>
        {#snippet trigger()}
          <span>
            <Inbox
              class="w-[1.15rem] h-[1.15rem] text-foreground/72"
              aria-hidden="true"
            />
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
          class="w-8 h-8 shrink-0"
          onClick={() => onVisibleChange?.(!isVisible)}
        />
      </div>
    {/if}
  </div>
</Card.Actions>
