<script lang="ts">
import { SectionHeader } from '$lib/bits/custom/form'
import * as UserCapabilityMatrixPrimitive from './components'
import type { UserCapabilityMatrixProps } from './userCapabilityMatrix.types'

let {
  title,
  subtitle,
  capabilityKeys,
  capabilityLabelByKey,
  rows,
  isEditing = false,
  onToggleCell,
}: UserCapabilityMatrixProps = $props()
</script>

<section class="bits-form__section bits-user-capability-matrix">
  <SectionHeader
    {title}
    description={subtitle}
    class="bits-user-capability-matrix__header"
  />

  <UserCapabilityMatrixPrimitive.Table
    {capabilityKeys}
    {capabilityLabelByKey}
    {rows}
    {isEditing}
    {onToggleCell}
  />
</section>
