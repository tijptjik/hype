<script lang="ts">
import { m } from '$lib/i18n'
import { Button } from '$lib/bits/core'
import { Card } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import type { OrganisationCapabilitiesListProps } from '../organisationCapabilities.types'
import Trash2Icon from 'virtual:icons/proicons/delete'
import ShieldCheckIcon from 'virtual:icons/proicons/shield-checkmark'

let {
  selectedCapabilityKeys,
  isEditing,
  isRemoveMode,
  getCapabilityDisplayLabel,
  onRemoveCapability,
}: OrganisationCapabilitiesListProps = $props()
</script>

<div class="bits-form__parent-resource-list bits-form__capabilities-list pt-2">
  {#each selectedCapabilityKeys as capabilityKey (capabilityKey)}
    <ResourceCard.Root class="w-full">
      <Card.Media class="bg-base-100/76" size="md">
        <div class="flex w-full h-full items-center justify-center" aria-hidden="true">
          <ShieldCheckIcon class="h-6 w-6 text-primary" />
        </div>
      </Card.Media>
      <ResourceCard.Body
        code={capabilityKey}
        name={getCapabilityDisplayLabel(capabilityKey)}
      />
      {#if isEditing && isRemoveMode}
        <Card.Actions padding="sm" class="min-w-max">
          <Button
            text={m.admin__forms_common_remove()}
            style="ghost"
            color="light"
            size="sm"
            modifier="square"
            iconComponent={Trash2Icon}
            onClick={() => onRemoveCapability(capabilityKey)}
            class="h-10 w-10"
          />
        </Card.Actions>
      {/if}
    </ResourceCard.Root>
  {/each}
</div>
