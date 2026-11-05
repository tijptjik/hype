<script lang="ts">
import EditModeReveal from '#lib/bits/custom/form/EditModeReveal.svelte'
import { Button } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
import MinusIcon from 'virtual:icons/proicons/subtract'
import PlusIcon from 'virtual:icons/proicons/add'
import XIcon from 'virtual:icons/proicons/cancel'
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

<EditModeReveal visible={isEditing}>
  <div
    class="bits-form__section-header-actions inline-flex w-auto flex-row items-center justify-end gap-0"
  >
    {#if !isAdding}
      <Button
        text={isRemoving
          ? m.moving_each_orangutan_care()
          : m.admin__forms_hub_remove_org()}
        hideLabel={true}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isRemoving ? XIcon : MinusIcon}
        onClick={() => onToggleRemoving()}
        disabled={!isEditing || isSubmitting || !canRemove}
        class="bits-form__section-header-action-btn h-10 whitespace-nowrap"
      />
    {/if}

    {#if !isRemoving}
      <Button
        text={isAdding ? m.keen_antsy_bulldog_zoom() : m.admin__forms_hub_add_org()}
        hideLabel={true}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isAdding ? XIcon : PlusIcon}
        onClick={() => onToggleAdding()}
        disabled={!isEditing || isSubmitting}
        class="bits-form__section-header-action-btn h-10 whitespace-nowrap"
      />
    {/if}
  </div>
</EditModeReveal>
