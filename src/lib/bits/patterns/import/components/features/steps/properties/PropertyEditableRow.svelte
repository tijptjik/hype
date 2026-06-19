<script lang="ts">
// BITS COMPONENTS
import { Swap } from '$lib/bits/custom/swap'
// ICONS
import Check from 'virtual:icons/lucide/check'
import Pencil from 'virtual:icons/lucide/pencil'

type Props = {
  label: string
  value: string
  localePrefix?: string
  isEditing: boolean
  onEdit: (checked: boolean) => void
  onInput: (value: string) => void
  onCommit?: () => void
}

let {
  label,
  value,
  localePrefix = '',
  isEditing,
  onEdit,
  onInput,
  onCommit,
}: Props = $props()

function handleCommit(): void {
  onCommit?.()
}
</script>

<div
  class="grid min-h-[4.35rem] gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-[12rem_minmax(0,1fr)_2.75rem] md:items-center"
>
  <div
    class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
  >
    {label}
  </div>
  {#if isEditing}
    <div class="flex items-center gap-2">
      {#if localePrefix}
        <span
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-warning"
        >
          {localePrefix}
        </span>
      {/if}
      <input
        class="input input-bordered w-full bg-black/30 px-3 py-2 font-mono text-sm"
        {value}
        oninput={event => onInput(event.currentTarget.value)}
        onblur={handleCommit}
        onkeydown={event => {
          if (event.key !== 'Enter' && event.key !== 'NumpadEnter') return
          event.preventDefault()
          handleCommit()
        }}
      >
    </div>
  {:else}
    <div class="flex min-w-0 items-center gap-2">
      {#if localePrefix}
        <span
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-warning"
        >
          {localePrefix}
        </span>
      {/if}
      <span class="min-w-0 truncate font-mono text-sm text-base-content/85">
        {value}
      </span>
    </div>
  {/if}
  <Swap
    checked={isEditing}
    offIcon={Pencil}
    onIcon={Check}
    size="sm"
    variant="transparent"
    offColor="dark"
    onColor="success"
    label={`Edit ${label}`}
    onCheckedChange={checked => onEdit(checked === true)}
  />
</div>
