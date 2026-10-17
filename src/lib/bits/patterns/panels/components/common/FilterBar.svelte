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
  class="mx-3 mb-2 flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface px-3 text-muted-foreground focus-within:border-focus"
>
  <Search class="size-4 shrink-0" aria-hidden="true" />
  <input
    class="focus-override h-10 min-w-0 flex-1 bg-transparent text-sm text-base-content outline-none"
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
