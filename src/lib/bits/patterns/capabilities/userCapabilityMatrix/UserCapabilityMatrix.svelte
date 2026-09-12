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

<section class="bits-form__section flex flex-col gap-2">
  <SectionHeader
    {title}
    description={subtitle}
    class="min-h-8 items-center pt-0 pb-0"
  />

  <UserCapabilityMatrixPrimitive.Table
    {capabilityKeys}
    {capabilityLabelByKey}
    {rows}
    {isEditing}
    {onToggleCell}
  />
</section>
