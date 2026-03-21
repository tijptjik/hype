<script lang="ts">
import { m } from '$lib/i18n'
import { Button } from '$lib/bits/core'
import { Card } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import type { OrganisationCapabilitiesListProps } from '../organisationCapabilities.types'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
import ShieldCheckIcon from 'virtual:icons/lucide/shield-check'

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
    <ResourceCard.Root class="bits-form__capabilities-card-root">
      <Card.Media class="bits-form__capabilities-card-icon-wrap" size="md">
        <div class="bits-form__capabilities-card-icon-shell" aria-hidden="true">
          <ShieldCheckIcon class="bits-form__capabilities-card-icon" />
        </div>
      </Card.Media>
      <ResourceCard.Body
        code={capabilityKey}
        name={getCapabilityDisplayLabel(capabilityKey)}
      />
      {#if isEditing && isRemoveMode}
        <Card.Actions padding="sm" class="bits-form__capabilities-card-actions">
          <Button
            text={m.admin__forms_common_remove()}
            style="ghost"
            color="light"
            size="sm"
            modifier="square"
            iconComponent={Trash2Icon}
            onClick={() => onRemoveCapability(capabilityKey)}
            class="bits-form__capabilities-remove-button"
          />
        </Card.Actions>
      {/if}
    </ResourceCard.Root>
  {/each}
</div>
