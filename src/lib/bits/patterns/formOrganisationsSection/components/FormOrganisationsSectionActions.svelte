<script lang="ts">
import { Button } from '$lib/bits/core'
import { m } from '$lib/i18n'
import MinusIcon from 'virtual:icons/lucide/minus'
import PlusIcon from 'virtual:icons/lucide/plus'
import XIcon from 'virtual:icons/lucide/x'
import type { FormOrganisationsSectionActionsProps } from '../formOrganisationsSection.types'

let {
  isAdding,
  isRemoving,
  isEditing = true,
  isSubmitting = false,
  canRemove = true,
  onToggleAdding,
  onToggleRemoving,
}: FormOrganisationsSectionActionsProps = $props()
</script>

{#if isEditing}
  <div
    class="bits-form__hub-orgs-actions flex w-full flex-row items-center justify-end gap-0"
  >
    {#if !isAdding}
      <Button
        text={isRemoving ? m.moving_each_orangutan_care() : m.hour_polite_ocelot_kiss()}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isRemoving ? XIcon : MinusIcon}
        onClick={() => onToggleRemoving()}
        disabled={!isEditing || isSubmitting || !canRemove}
        class="bits-form__hub-orgs-action whitespace-nowrap h-10"
      />
    {/if}

    {#if !isRemoving}
      <Button
        text={isAdding ? m.keen_antsy_bulldog_zoom() : m.kind_active_haddock_ascend()}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isAdding ? XIcon : PlusIcon}
        onClick={() => onToggleAdding()}
        disabled={!isEditing || isSubmitting}
        class="bits-form__hub-orgs-action whitespace-nowrap h-10"
      />
    {/if}
  </div>
{/if}
