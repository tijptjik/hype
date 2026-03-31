<script lang="ts">
import { Card } from '$lib/bits/custom'
import { Switch } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import ShieldCheckIcon from 'virtual:icons/lucide/shield-check'
import type { CapabilityKey } from '$lib/types'

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
    <ResourceCard.Root class="bits-project-capabilities__card-root">
      <Card.Media class="bits-project-capabilities__card-icon-wrap" size="md">
        <div class="bits-project-capabilities__card-icon-shell" aria-hidden="true">
          <ShieldCheckIcon class="bits-project-capabilities__card-icon" />
        </div>
      </Card.Media>
      <ResourceCard.Body
        code={capabilityKey}
        name={capabilityLabelByKey[capabilityKey] ?? capabilityKey}
      />
      <Card.Actions padding="sm" class="bits-project-capabilities__card-actions">
        <Switch
          checked={enabledSet.has(capabilityKey)}
          disabled={!isEditing}
          onCheckedChange={value => onToggleCapability(capabilityKey, value === true)}
        />
      </Card.Actions>
    </ResourceCard.Root>
  {/each}
</div>
