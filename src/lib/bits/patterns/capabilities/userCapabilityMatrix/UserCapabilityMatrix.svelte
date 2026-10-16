<script lang="ts">
import { SectionHeader } from '#lib/bits/custom/form/index.js'
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

<section class="bits-form__section flex min-w-0 flex-col gap-0">
  <SectionHeader
    {title}
    description={subtitle}
    class="min-h-16 items-center pt-0 pb-0"
  />

  <UserCapabilityMatrixPrimitive.Table
    {capabilityKeys}
    {capabilityLabelByKey}
    {rows}
    {isEditing}
    {onToggleCell}
  />
</section>
