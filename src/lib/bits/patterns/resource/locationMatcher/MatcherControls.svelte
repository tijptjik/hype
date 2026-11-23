<script lang="ts">
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import LocationSearchRadius from '../../forms/featureLocation/LocationSearchRadius.svelte'
let {
  query,
  locale,
  radius,
  busy,
  disabled,
  count,
  onquery,
  onlocale,
  onradius,
  onsearch,
}: {
  query: string
  locale: string
  radius: number
  busy: boolean
  disabled: boolean
  count: number
  onquery: (value: string) => void
  onlocale: (value: string) => void
  onradius: (value: number) => void
  onsearch: () => void
} = $props()
</script>
<form
  aria-label="Location matching filters"
  class="flex min-h-16 w-full items-center gap-3 overflow-x-auto px-4 py-2"
  onsubmit={event => {
    event.preventDefault()
    onsearch()
  }}
>
  <label class="min-w-40 flex-1"
    ><span class="sr-only">SaanSeoi name or shop code</span>
    <input
      aria-label="SaanSeoi name or shop code"
      type="search"
      value={query}
      oninput={event => onquery(event.currentTarget.value)}
      maxlength="200"
      placeholder="Search SaanSeoi by name or shop code"
      class="border-border bg-panel h-10 w-full rounded-md border px-3"
      {disabled}
    ></label
  >
  <select
    aria-label="Search language"
    class="border-border bg-panel h-10 rounded-md border px-2"
    value={locale}
    onchange={event => onlocale(event.currentTarget.value)}
    {disabled}
  >
    <option value="en">English</option>
    <option value="zh-hant">繁體中文</option>
    <option value="zh-hans">简体中文</option>
  </select>
  <LocationSearchRadius
    compact
    bind:value={radius}
    {disabled}
    onchange={() => onradius(radius)}
  />
  <span class="text-muted-foreground shrink-0 text-xs tabular-nums" aria-live="polite"
    >{count} candidates</span
  >
  <Button
    type="submit"
    text="Search SaanSeoi"
    disabled={disabled || busy || !query.trim()}
  />
</form>
