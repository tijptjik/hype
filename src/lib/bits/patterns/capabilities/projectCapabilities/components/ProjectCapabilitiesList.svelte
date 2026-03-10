<script lang="ts">
import { Switch } from '$lib/bits/custom'
import { OrganisationCard } from '$lib/bits/patterns/cards/organisationCard'
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
    <OrganisationCard.Root class="bits-project-capabilities__card-root">
      <div class="bits-project-capabilities__card-icon-wrap">
        <ShieldCheckIcon class="bits-project-capabilities__card-icon" />
      </div>
      <OrganisationCard.Body
        code={capabilityKey}
        name={capabilityLabelByKey[capabilityKey] ?? capabilityKey}
      />
      <div class="bits-project-capabilities__card-switch-wrap">
        <Switch
          checked={enabledSet.has(capabilityKey)}
          disabled={!isEditing}
          onCheckedChange={value => onToggleCapability(capabilityKey, value === true)}
        />
      </div>
    </OrganisationCard.Root>
  {/each}
</div>
