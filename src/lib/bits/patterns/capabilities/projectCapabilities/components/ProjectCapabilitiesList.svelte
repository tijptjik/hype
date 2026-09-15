<script lang="ts">
import { Card } from '$lib/bits/custom'
import { Switch } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import ShieldCheckIcon from 'virtual:icons/proicons/shield-checkmark'
import type { CapabilityKey } from '$lib/capabilities.types'

let {
  availableCapabilityKeys,
  enabledCapabilityKeys,
  capabilityLabelByKey,
  isEditing = false,
  onToggleCapability,
}: {
  availableCapabilityKeys: CapabilityKey[]
  enabledCapabilityKeys: CapabilityKey[]
  capabilityLabelByKey: Partial<Record<CapabilityKey, string>>
  isEditing?: boolean
  onToggleCapability: (capabilityKey: CapabilityKey, value: boolean) => void
} = $props()

const enabledSet = $derived(new Set(enabledCapabilityKeys))
</script>

<div class="bits-project-capabilities__list">
  {#each availableCapabilityKeys as capabilityKey (capabilityKey)}
    <ResourceCard.Root class="w-full">
      <Card.Media class="bg-base-100/76" size="md">
        <div class="flex w-full h-full items-center justify-center" aria-hidden="true">
          <ShieldCheckIcon class="h-6 w-6 text-primary" />
        </div>
      </Card.Media>
      <ResourceCard.Body
        code={capabilityKey}
        name={capabilityLabelByKey[capabilityKey] ?? capabilityKey}
      />
      <Card.Actions padding="sm" class="min-w-max">
        <Switch
          checked={enabledSet.has(capabilityKey)}
          disabled={!isEditing}
          onCheckedChange={value => onToggleCapability(capabilityKey, value === true)}
        />
      </Card.Actions>
    </ResourceCard.Root>
  {/each}
</div>
