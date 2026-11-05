<script lang="ts">
import EditModeReveal from '#lib/bits/custom/form/EditModeReveal.svelte'
import { Button } from '#lib/bits/core/index.js'
import UserPlusIcon from 'virtual:icons/proicons/person-add'
import UserMinusIcon from 'virtual:icons/tabler/user-minus'
import XIcon from 'virtual:icons/proicons/cancel'
import { m } from '#lib/i18n.js'
import type { FormUserRolesSectionActionsProps } from '../formUserRolesSection.types'

let {
  isAdding,
  isRemoving,
  isEditing = true,
  isSubmitting = false,
  onToggleAdding,
  onToggleRemoving,
}: FormUserRolesSectionActionsProps = $props()
</script>

<EditModeReveal visible={isEditing}>
  <div
    class="bits-form__section-header-actions flex w-full flex-row items-center justify-end gap-0"
  >
    {#if !isAdding}
      <Button
        text={isRemoving ? m.moving_each_orangutan_care() : m.hour_polite_ocelot_kiss()}
        hideLabel={true}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isRemoving ? XIcon : UserMinusIcon}
        onClick={() => onToggleRemoving()}
        disabled={!isEditing || isSubmitting}
        class="bits-form__section-header-action-btn h-10 whitespace-nowrap"
      />
    {/if}

    {#if !isRemoving}
      <Button
        text={isAdding ? m.keen_antsy_bulldog_zoom() : m.kind_active_haddock_ascend()}
        hideLabel={true}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isAdding ? XIcon : UserPlusIcon}
        onClick={() => onToggleAdding()}
        disabled={!isEditing || isSubmitting}
        class="bits-form__section-header-action-btn h-10 whitespace-nowrap"
      />
    {/if}
  </div>
</EditModeReveal>
