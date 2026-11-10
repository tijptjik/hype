<script lang="ts">
// BITS COMPONENTS
import { Switch } from '#lib/bits/custom/index.js'
// I18N
import { m } from '#lib/i18n.js'

type Props = {
  id: string
  checked?: boolean
  isEditing?: boolean
  onChange: (value: boolean) => void
}

let { id, checked = false, isEditing = true, onChange }: Props = $props()
</script>

{#if isEditing}
  <Switch
    {id}
    {checked}
    leftText={m.no()}
    rightText={m.yes()}
    onCheckedChange={nextValue => onChange(nextValue ?? false)}
  />
{:else}
  <span {id} class="text-foreground text-base uppercase">
    {checked ? m.yes() : m.no()}
  </span>
{/if}
