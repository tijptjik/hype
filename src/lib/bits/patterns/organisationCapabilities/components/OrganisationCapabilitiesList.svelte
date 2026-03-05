<script lang="ts">
import { m } from '$lib/i18n'
import { Button } from '$lib/bits/core'
import { OrganisationCard } from '$lib/bits/patterns/organisationCard'
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

<div class="bits-form__hub-orgs-list bits-form__capabilities-list pt-2">
  {#each selectedCapabilityKeys as capabilityKey (capabilityKey)}
    <OrganisationCard.Root class="bits-form__capabilities-card-root">
      <div class="bits-form__capabilities-card-icon-wrap" aria-hidden="true">
        <ShieldCheckIcon class="bits-form__capabilities-card-icon" />
      </div>
      <OrganisationCard.Body
        code={capabilityKey}
        name={getCapabilityDisplayLabel(capabilityKey)}
      />
      {#if isEditing && isRemoveMode}
        <div class="bits-form__hub-orgs-item-remove">
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
        </div>
      {/if}
    </OrganisationCard.Root>
  {/each}
</div>
