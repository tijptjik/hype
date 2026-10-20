<script lang="ts">
// BITS
import { Calendar } from 'bits-ui'
// DATE
import { parseDate } from '@internationalized/date'
// ICONS
import ChevronLeft from 'virtual:icons/proicons/chevron-left'
import ChevronRight from 'virtual:icons/proicons/chevron-right'
let {
  value = '',
  min,
  max,
  onChange,
}: {
  value?: string
  min?: string
  max?: string
  onChange: (value: string) => void
} = $props()
const years = $derived(
  Array.from(
    { length: Number(max?.slice(0, 4) ?? 2100) - Number(min?.slice(0, 4) ?? 1900) + 1 },
    (_, i) => Number(min?.slice(0, 4) ?? 1900) + i,
  ),
)
const parsed = $derived.by(() => {
  try {
    return value ? parseDate(value) : undefined
  } catch {
    return undefined
  }
})
</script>
<Calendar.Root
  type="single"
  value={parsed}
  minValue={min ? parseDate(min) : undefined}
  maxValue={max ? parseDate(max) : undefined}
  onValueChange={date => onChange(date?.toString() ?? '')}
  weekdayFormat="short"
  fixedWeeks
  preventDeselect
  class="w-72 p-3 text-foreground"
>
  {#snippet children({
    months,
    weekdays,
  })}
    <Calendar.Header class="mb-3 flex items-center gap-2">
      <Calendar.PrevButton
        aria-label="Previous month"
        class="flex size-8 items-center justify-center rounded hover:bg-primary/10 disabled:opacity-30"
        ><ChevronLeft class="size-4" /></Calendar.PrevButton
      >
      <Calendar.MonthSelect
        aria-label="Month"
        class="min-w-0 flex-1 rounded border border-border bg-panel p-1 text-sm"
      />
      <Calendar.YearSelect
        {years}
        aria-label="Year"
        class="rounded border border-border bg-panel p-1 text-sm"
      />
      <Calendar.NextButton
        aria-label="Next month"
        class="flex size-8 items-center justify-center rounded hover:bg-primary/10 disabled:opacity-30"
        ><ChevronRight class="size-4" /></Calendar.NextButton
      >
    </Calendar.Header>
    {#each months as month}
      <Calendar.Grid class="w-full border-collapse">
        <Calendar.GridHead
          ><Calendar.GridRow
            >{#each weekdays as weekday}
              <Calendar.HeadCell
                class="h-8 text-center text-xs font-normal text-muted-foreground"
                >{weekday.slice(0, 2)}</Calendar.HeadCell
              >
            {/each}</Calendar.GridRow
          ></Calendar.GridHead
        >
        <Calendar.GridBody>
          {#each month.weeks as week}
            <Calendar.GridRow>
              {#each week as date}
                <Calendar.Cell {date} month={month.value} class="p-0 text-center">
                  <Calendar.Day
                    class="flex size-9 items-center justify-center rounded text-sm hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary data-selected:bg-primary data-selected:text-primary-foreground data-today:ring-1 data-today:ring-primary/50 data-outside-month:opacity-30 data-disabled:pointer-events-none data-disabled:opacity-20"
                    >{date.day}</Calendar.Day
                  >
                </Calendar.Cell>
              {/each}
            </Calendar.GridRow>
          {/each}
        </Calendar.GridBody>
      </Calendar.Grid>
    {/each}
  {/snippet}
</Calendar.Root>
