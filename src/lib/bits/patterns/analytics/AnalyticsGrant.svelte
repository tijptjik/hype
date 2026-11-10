<script lang="ts">
// BITS COMPONENTS
import Checkbox from '#lib/bits/custom/checkbox/Checkbox.svelte'
// ICONS
import AnalyticsIcon from 'virtual:icons/proicons/bar-chart'

let {
  userId,
  isOwner = false,
  enabled = false,
  isEditing = false,
  onChange,
}: {
  userId: string
  isOwner?: boolean
  enabled?: boolean
  isEditing?: boolean
  onChange?: (value: boolean) => void
} = $props()
const id = $props.id()
</script>

<div class="text-foreground-alt flex shrink-0 items-center gap-2 text-sm">
  <label for={`${id}-${userId}`} class="flex items-center gap-1.5">
    <AnalyticsIcon class="size-4" aria-hidden="true" />
    <span>Analytics</span>
  </label>
  <Checkbox
    id={`${id}-${userId}`}
    size="sm"
    checked={isOwner || enabled}
    disabled={isOwner || !isEditing}
    onCheckedChange={value => {
      if (!isOwner) onChange?.(value)
    }}
  />
</div>
