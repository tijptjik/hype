<script lang="ts">
import { Checkbox } from '$lib/bits/custom'
import type { UserCapabilityMatrixProps } from '../userCapabilityMatrix.types'

let {
  capabilityKeys,
  capabilityLabelByKey,
  rows,
  isEditing = false,
  onToggleCell,
}: Omit<UserCapabilityMatrixProps, 'title' | 'subtitle'> = $props()
</script>

<div class="bits-user-capability-matrix__table-wrap">
  <table class="bits-user-capability-matrix__table">
    <thead>
      <tr>
        <th
          class="bits-user-capability-matrix__head-cell bits-user-capability-matrix__head-cell--user"
        >
          User
        </th>
        {#each capabilityKeys as capabilityKey (capabilityKey)}
          <th
            class="bits-user-capability-matrix__head-cell bits-user-capability-matrix__head-cell--capability"
          >
            <span class="bits-user-capability-matrix__head-label"
              >{capabilityLabelByKey[capabilityKey] ?? capabilityKey}</span
            >
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.userId)}
        <tr class="bits-user-capability-matrix__row">
          <th class="bits-user-capability-matrix__user-cell" scope="row">
            <span class="bits-user-capability-matrix__user-name">{row.name}</span>
            <span class="bits-user-capability-matrix__user-role">{row.role}</span>
          </th>
          {#each capabilityKeys as capabilityKey (capabilityKey)}
            <td class="bits-user-capability-matrix__cell">
              <Checkbox
                checked={row.capabilities?.[capabilityKey] === true}
                disabled={!isEditing}
                onCheckedChange={value =>
                  onToggleCell({
                    userId: row.userId,
                    capabilityKey,
                    value,
                  })}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
