<script lang="ts">
// ICONS
import Search from 'virtual:icons/proicons/search'
// I18N
import { m } from '#lib/i18n.js'

let {
  searchTerm = $bindable(''),
  label = m.legal_clear_panther_soar(),
  onReset,
}: {
  searchTerm: string
  label?: string
  onReset?: () => void
} = $props()
</script>

<label
  class="border-border bg-surface text-muted-foreground focus-within:border-focus mx-3 mb-2 flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border px-3"
>
  <Search class="size-4 shrink-0" aria-hidden="true" />
  <input
    class="focus-override text-base-content h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
    type="search"
    autocomplete="off"
    aria-label={label}
    placeholder={label}
    bind:value={searchTerm}
    onkeydown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (searchTerm) {
          searchTerm = ''
        } else {
          // Clear selection when the search is already empty.
          onReset?.()
        }
      }
    }}
  >
</label>
