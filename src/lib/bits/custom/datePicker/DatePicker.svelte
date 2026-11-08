<script lang="ts">
// DISPLAY
import { singleDateText } from '#lib/properties/range.js'
// BITS
import Calendar from '#lib/bits/core/calendar/Calendar.svelte'
import { Popover } from '#lib/bits/core/popover/index.js'
// ICONS
import CalendarIcon from 'virtual:icons/proicons/calendar'
let {
  value = '',
  label = 'Choose date',
  disabled = false,
  min,
  max,
  onChange,
}: {
  value?: string
  label?: string
  disabled?: boolean
  min?: string
  max?: string
  onChange: (value: string) => void
} = $props()
let open = $state(false)
</script>
{#if disabled}
  <output class="flex min-h-12 items-center text-base"
    >{singleDateText(value) || '—'}</output
  >
{:else}
  <Popover
    bind:open
    triggerProps={{ 'aria-label': label, role: 'button', tabindex: 0 }}
    triggerClass="bits-form__control-wrap bits-form__control-wrap--editing flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg w-full px-3 outline-none focus-visible:ring-1 focus-visible:ring-primary data-[state=open]:ring-1 data-[state=open]:ring-primary"
    contentClass="z-[250] rounded-lg border border-border bg-panel text-foreground shadow-xl"
    contentProps={{ align: 'start' }}
  >
    {#snippet trigger()}
      <span class="text-sm">{value || 'Choose date'}</span>
      <CalendarIcon class="text-muted-foreground size-4 shrink-0" />
    {/snippet}
    <Calendar
      {value}
      {min}
      {max}
      onChange={next => {
        onChange(next)
        open = false
      }}
    />
    <div class="border-border flex justify-end border-t px-3 py-2">
      <button
        type="button"
        class="text-muted-foreground hover:text-primary text-xs"
        onclick={() => {
          onChange('')
          open = false
        }}
      >
        Clear date
      </button>
    </div>
  </Popover>
{/if}
