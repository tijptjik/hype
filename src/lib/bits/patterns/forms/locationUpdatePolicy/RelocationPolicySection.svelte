<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { SectionHeader } from '#lib/bits/custom/index.js'
import PolicySelect from './PolicySelect.svelte'
// ICONS
import MapPinIcon from 'virtual:icons/proicons/location'
import ShopIcon from 'virtual:icons/lucide/store'
// TYPES
import type { RelocationPolicy } from '#lib/locations/model.js'

let {
  value,
  inherited,
  allowInherit = false,
  isEditing = true,
  saving = false,
  onValueChange,
}: {
  value: RelocationPolicy | null
  inherited?: RelocationPolicy
  allowInherit?: boolean
  isEditing?: boolean
  saving?: boolean
  onValueChange: (value: RelocationPolicy | null) => void
} = $props()
const labels = $derived({
  fixed: m.location_policy_fixed(),
  review: m.location_policy_review(),
  follow: m.location_policy_follow(),
})
const items = $derived([
  ...(allowInherit ? [{ value: 'inherit', label: m.location_policy_inherit() }] : []),
  ...(['fixed', 'review', 'follow'] as const).map(code => ({
    value: code,
    label: labels[code],
  })),
])
</script>

<section>
  <SectionHeader
    title={m.location_policy_title()}
    description={m.location_policy_description()}
    icon={MapPinIcon}
  />
  <div
    class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-8 p-4 sm:p-6"
  >
    <div
      class="flex flex-col gap-5 rounded-xl border border-[var(--form-control-border)] bg-[var(--form-control-edit-fill)] p-5"
    >
      <div class="flex flex-1 items-start gap-3">
        <span
          class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg"
          aria-hidden="true"
        >
          <ShopIcon class="size-5" />
        </span>
        <div class="min-w-0">
          <h3 class="font-medium">{m.location_policy_relocation()}</h3>
          <p class="text-muted-foreground mt-1 text-sm leading-relaxed">
            {m.location_policy_relocation_help()}
          </p>
        </div>
      </div>
      <PolicySelect
        label={m.location_policy_relocation()}
        value={value ?? 'inherit'}
        {items}
        {isEditing}
        disabled={saving}
        onValueChange={selected => {
          if (selected === 'inherit' && allowInherit) onValueChange(null)
          else if (
            selected === 'fixed' ||
            selected === 'review' ||
            selected === 'follow'
          ) {
            onValueChange(selected)
          }
        }}
      />

      {#if allowInherit && inherited}
        <p class="text-muted-foreground text-sm">
          {m.location_policy_project_default({ policy: '' })}
          <span class="text-foreground font-medium">{labels[inherited]}</span>
        </p>
      {/if}
    </div>
  </div>
</section>
