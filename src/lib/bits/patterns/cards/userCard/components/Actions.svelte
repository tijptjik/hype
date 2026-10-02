<script lang="ts">
import { Button, Select } from '#lib/bits/core/index.js'
import { Card } from '#lib/bits/custom/index.js'
import { m } from '#lib/i18n.js'
import Trash2Icon from 'virtual:icons/proicons/delete'
import type { OrganisationRoleType } from '#lib/enums.js'
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
const slotClass = $derived(
  [
    'bits-form__user-card-actions-slot',
    isRemoving
      ? 'bits-form__user-card-actions-slot--remove'
      : 'bits-form__user-card-actions-slot--select',
  ].join(' '),
)

function handleRoleChange(nextValue: string): void {
  onRoleChange?.(nextValue as OrganisationRoleType)
}
</script>

<Card.Actions
  padding="sm"
  gap={8}
  class={`bits-form__user-card-actions ${className} px-0`}
>
  {#if roleFieldName}
    <input type="hidden" name={roleFieldName} value={selectedRole}>
  {/if}

  <div class={slotClass}>
    <div
      class="bits-form__user-card-actions-slot-content bits-form__user-card-actions-slot-content--select"
      aria-hidden={isRemoving}
    >
      <Select
        value={selectedRole}
        items={roleOptions}
        variant="ghost"
        allowDeselect={false}
        onValueChange={handleRoleChange}
        disabled={!isEditing || isRemoving}
        {isEditing}
        class="bits-form__user-card-actions-select"
        placeholder={labelByRole}
      />
    </div>

    <div
      class="bits-form__user-card-actions-slot-content bits-form__user-card-actions-slot-content--remove"
      aria-hidden={!isRemoving}
    >
      <Button
        text={m.watery_trite_shrimp_clip()}
        style="ghost"
        color="error"
        iconComponent={Trash2Icon}
        hideLabel={true}
        onClick={() => onRemove?.()}
        disabled={!isEditing || !isRemoving}
        class="min-w-0 w-12 justify-center"
      />
    </div>
  </div>
</Card.Actions>
