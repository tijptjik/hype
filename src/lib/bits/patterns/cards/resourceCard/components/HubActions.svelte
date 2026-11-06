<script lang="ts">
// COMPONENTS
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
    class="grid max-w-full min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center justify-items-end gap-y-1 @min-[56rem]:flex @min-[56rem]:flex-wrap @min-[56rem]:justify-end"
  >
    <ResourceCardPolicySelect
      class={`col-start-1 ${canSetCoreInclusive ? '@min-[56rem]:mr-3' : ''}`}
      label="Map sharing"
      showInfo={false}
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
    {#if hasRemoveAction}
      <!-- Reserve the remove action's space while viewing so the policy labels stay put. -->
      <div
        class="col-start-2 row-start-1 flex size-10 shrink-0 items-center justify-center transition-opacity duration-180 ease-in-out motion-reduce:transition-none"
        class:row-span-2={canSetCoreInclusive}
        style:opacity={isEditing ? 1 : 0}
        inert={!isEditing}
        aria-hidden={!isEditing}
      >
        <button
          type="button"
          aria-label="Remove organisation"
          class="text-muted-foreground hover:bg-error/10 hover:text-error focus-visible:outline-primary flex size-9 items-center justify-center rounded-md transition-colors focus-visible:outline"
          onclick={() => onRemove?.()}
          disabled={isDisabled}
        >
          <Trash2Icon class="size-4" aria-hidden="true" />
        </button>
      </div>
    {/if}
  </div>
</Card.Actions>
