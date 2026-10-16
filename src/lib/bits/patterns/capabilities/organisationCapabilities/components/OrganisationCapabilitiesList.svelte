<script lang="ts">
import { m } from '#lib/i18n.js'
import { Button } from '#lib/bits/core/index.js'
import type { OrganisationCapabilitiesListProps } from '../organisationCapabilities.types'
import Trash2Icon from 'virtual:icons/proicons/delete'
import ShieldCheckIcon from 'virtual:icons/proicons/shield-checkmark'

let {
  selectedCapabilityKeys,
  isEditing,
  getCapabilityDisplayLabel,
  onRemoveCapability,
}: OrganisationCapabilitiesListProps = $props()
</script>

<div class="bits-form__parent-resource-list bits-form__capabilities-list pt-2">
  {#each selectedCapabilityKeys as capabilityKey (capabilityKey)}
    <div
      class="flex min-h-14 items-center gap-4 border-b border-border/40 px-3 last:border-b-0"
    >
      <ShieldCheckIcon class="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 text-[15px] font-medium"
        >{getCapabilityDisplayLabel(capabilityKey)}</span
      >
      <div class="size-10 shrink-0" inert={!isEditing}>
        {#if isEditing}
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
        {/if}
      </div>
    </div>
  {/each}
</div>
