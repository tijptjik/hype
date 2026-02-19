<script lang="ts">
import { Button } from '$lib/bits/core'
import UserPlusIcon from 'virtual:icons/lucide/user-plus'
import UserMinusIcon from 'virtual:icons/lucide/user-minus'
import XIcon from 'virtual:icons/lucide/x'
import { m } from '$lib/i18n'
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

{#if isEditing}
  <div class="flex w-full flex-row items-center justify-end gap-0">
    {#if !isAdding}
      <Button
        text={isRemoving
        ? m.moving_each_orangutan_care()
        : m.hour_polite_ocelot_kiss()}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isRemoving ? XIcon : UserMinusIcon}
        onClick={() => onToggleRemoving()}
        disabled={!isEditing || isSubmitting}
        class="whitespace-nowrap h-10"
      />
    {/if}

    {#if !isRemoving}
      <Button
        text={isAdding ? m.keen_antsy_bulldog_zoom() : m.kind_active_haddock_ascend()}
        style="ghost"
        color="light"
        size="sm"
        iconComponent={isAdding ? XIcon : UserPlusIcon}
        onClick={() => onToggleAdding()}
        disabled={!isEditing || isSubmitting}
        class="whitespace-nowrap h-10"
      />
    {/if}
  </div>
{/if}
