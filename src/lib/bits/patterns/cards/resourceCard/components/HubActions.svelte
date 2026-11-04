<script lang="ts">
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import { Card } from '#lib/bits/custom/index.js'
import ResourceCardPolicySelect from './ResourceCardPolicySelect.svelte'
import HypeMarkIcon from './HypeMarkIcon.svelte'
// ICONS
import Trash2Icon from 'virtual:icons/proicons/delete'
import ExclusiveIcon from 'virtual:icons/lucide/lock-keyhole'
import ExcludedIcon from 'virtual:icons/lucide/eye-off'
// TYPES
import type { ResourceCardHubActionsProps } from '../resourceCard.types'

let {
  isEditing = true,
  isSubmitting = false,
  canSetCoreInclusive = false,
  isHubExclusive,
  isCoreInclusive,
  onToggleHubExclusive,
  onToggleCoreInclusive,
  onRemove,
  class: className = '',
}: ResourceCardHubActionsProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
const hasRemoveAction = $derived(typeof onRemove === 'function')
</script>

<Card.Actions
  gap={4}
  class={`bits-form__resource-card-hub-actions max-w-full min-w-0! ${className}`}
>
  <div
    class="grid max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center justify-items-end gap-x-2 gap-y-1 @min-[56rem]:flex @min-[56rem]:flex-wrap @min-[56rem]:justify-end @min-[56rem]:gap-x-3"
  >
    <ResourceCardPolicySelect
      class="col-start-1"
      label="Map sharing"
      value={isHubExclusive ? 'exclusive' : 'shared'}
      items={[
        {
          value: 'shared',
          label: 'List on HYPE.hk',
          description: 'Share your map with others through HYPE.hk.',
          icon: HypeMarkIcon,
        },
        {
          value: 'exclusive',
          label: 'Hub Exclusive',
          description:
            "Only offer your map through your own domain. Your map won't be recommended on HYPE.hk.",
          icon: ExclusiveIcon,
        },
      ]}
      {isEditing}
      disabled={isDisabled}
      onChange={value => {
        if (value === 'shared' || value === 'exclusive')
          onToggleHubExclusive(value === 'exclusive')
      }}
    />
    {#if canSetCoreInclusive}
      <ResourceCardPolicySelect
        class="col-start-1"
        label="HYPE.hk listing"
        showInfo={false}
        value={isCoreInclusive ? 'included' : 'excluded'}
        items={[
          {
            value: 'included',
            label: 'Include in HYPE.hk',
            description: 'Let people find your map on HYPE.hk.',
            icon: HypeMarkIcon,
          },
          {
            value: 'excluded',
            label: 'Exclude in HYPE.hk',
            description:
              "Your map won't be recommended on HYPE.hk. People can still visit your own domain.",
            icon: ExcludedIcon,
          },
        ]}
        note="Hub Exclusive keeps your map on your own domain, even if you choose Include in HYPE.hk."
        {isEditing}
        disabled={isDisabled}
        onChange={value => {
          if (value === 'included' || value === 'excluded')
            onToggleCoreInclusive(value === 'included')
        }}
      />
    {/if}
    {#if hasRemoveAction && isEditing}
      <div class="col-start-2 row-start-1" class:row-span-2={canSetCoreInclusive}>
        <Button
          text="Remove organisation"
          style="ghost"
          color="light"
          size="sm"
          iconComponent={Trash2Icon}
          hideLabel={true}
          onClick={() => onRemove?.()}
          disabled={isDisabled}
        />
      </div>
    {/if}
  </div>
</Card.Actions>
