<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
// DOMAIN
import { PlaceResetSchema, type PlaceReset } from '#lib/places/reset.js'

let {
  revision,
  reset,
  onChange,
}: {
  revision: string
  reset?: unknown
  onChange: (reset: PlaceReset | undefined) => void
} = $props()
const parsed = $derived(PlaceResetSchema.safeParse(reset))
const pending = $derived(parsed.success ? parsed.data : null)
const choices = $derived([
  { key: 'en', label: m.place_reset_name_en() },
  { key: 'zhHant', label: m.place_reset_name_hant() },
  { key: 'zhHans', label: m.place_reset_name_hans() },
  { key: 'phoneNumber', label: m.place_reset_phones() },
  { key: 'location', label: m.place_reset_location() },
] as const)

/** Toggle deferred reset intent, keeping the first viewed association revision. */
function toggle(key: (typeof choices)[number]['key']): void {
  const next: PlaceReset = pending
    ? structuredClone($state.snapshot(pending))
    : { expectedRevision: revision, names: [], phoneNumber: false, location: false }
  if (key === 'phoneNumber' || key === 'location') next[key] = !next[key]
  else
    next.names = next.names.includes(key)
      ? next.names.filter(name => name !== key)
      : [...next.names, key]
  onChange(next.names.length || next.phoneNumber || next.location ? next : undefined)
}
</script>

<div class="space-y-3 rounded-xl border border-border p-4">
  <p class="font-medium">{m.place_reset_title()}</p>
  <p class="text-sm text-muted-foreground">{m.place_reset_description()}</p>
  <div class="flex flex-wrap gap-2">
    {#each choices as choice}
      {@const selected =
        choice.key === 'location' || choice.key === 'phoneNumber'
          ? (pending?.[choice.key] ?? false)
          : (pending?.names.includes(choice.key) ?? false)}
      <Button
        type="button"
        attrs={{ 'aria-pressed': selected }}
        text={`${selected ? '✓ ' : ''}${choice.label}`}
        onClick={() => toggle(choice.key)}
      />
    {/each}
  </div>
</div>
