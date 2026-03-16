<script lang="ts">
import { Switch } from '$lib/bits/custom'

type Props = {
  checked?: boolean
  isEditing?: boolean
  onChange: (value: boolean) => void
}

let { checked = false, isEditing = true, onChange }: Props = $props()
</script>

<Switch
  {checked}
  disabled={!isEditing}
  onCheckedChange={nextValue => onChange(nextValue ?? false)}
/>
