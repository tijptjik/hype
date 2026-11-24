<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'

let {
  checked,
  hasName,
  disabled,
  onChange,
}: {
  checked: boolean
  hasName: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
} = $props()
</script>

<label
  class="flex items-center gap-2 text-sm"
  title={hasName ? m.building_clear_names_first() : undefined}
>
  <input
    type="checkbox"
    checked={checked && !hasName}
    disabled={disabled || hasName}
    onchange={event => onChange(event.currentTarget.checked)}
  >
  {m.building_mark_unnamed()}
</label>
