<script lang="ts">
import { Button, Select } from '$lib/bits/core'
import { m } from '$lib/i18n'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
import type { OrganisationRoleType } from '$lib/enums'
import type { UserCardActionsProps } from '../userCard.types'

let {
  selectedRole,
  roleOptions,
  roleFieldName,
  isRemoving = false,
  isEditing = true,
  onRoleChange,
  onRemove,
  class: className = '',
}: UserCardActionsProps = $props()

const labelByRole = $derived(
  roleOptions.find(option => option.value === selectedRole)?.label ?? selectedRole,
)

function handleRoleChange(nextValue: string): void {
  onRoleChange?.(nextValue as OrganisationRoleType)
}
</script>

<div class={`bits-form__user-card-actions ${className}`}>
  {#if isRemoving}
    <Button
      text={m.watery_trite_shrimp_clip()}
      style="ghost"
      color="error"
      iconComponent={Trash2Icon}
      onClick={() => onRemove?.()}
      disabled={!isEditing}
      class="bits-form__user-card-actions-remove-button"
    />
  {:else}
    <Select
      value={selectedRole}
      items={roleOptions}
      name={roleFieldName}
      variant="ghost"
      allowDeselect={false}
      onValueChange={handleRoleChange}
      disabled={!isEditing}
      {isEditing}
      class="bits-form__user-card-actions-select"
      placeholder={labelByRole}
    />
  {/if}
</div>
