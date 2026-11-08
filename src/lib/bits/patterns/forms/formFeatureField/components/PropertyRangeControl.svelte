<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// SLIDER
import RangeSlider from 'svelte-range-slider-pips'
// BITS
import { Popover } from '#lib/bits/core/popover/index.js'
import DatePicker from '#lib/bits/custom/datePicker/DatePicker.svelte'
// ICONS
import ResetIcon from 'virtual:icons/proicons/arrow-counterclockwise'
import CalendarIcon from 'virtual:icons/proicons/calendar'
import SettingsIcon from 'virtual:icons/proicons/settings'
// CONTRACT
import {
  formatRangeEndpoint,
  isRangeProperty,
  parseRangeEndpoint,
  rangeDomain,
  type RangeDefinition,
} from '#lib/properties/range.js'

let {
  definition,
  values,
  compact = false,
  disabled = false,
  hasValue = true,
  onReset,
  onChange,
}: {
  compact?: boolean
  definition: RangeDefinition
  values: [number, number]
  disabled?: boolean
  hasValue?: boolean
  onReset?: () => void
  onChange: (values: [number, number]) => void
} = $props()
let showInputs = $state(false)
let showSettings = $state(false)
let timeStep = $state(5)
const inputId = $props.id()
const domain = $derived(rangeDomain(definition))
let selected = $state<number[]>(untrack(() => [...values]))
$effect(() => {
  selected = [...values]
})
const isDay = $derived(
  definition.dataType === 'dateRange' &&
    (!definition.dateResolution || definition.dateResolution === 'day'),
)
const format = (value: number): string =>
  isRangeProperty(definition) ? formatRangeEndpoint(definition, value) : String(value)
let inputError = $state('')
function editEndpoint(index: number, text: string): void {
  try {
    const next = isRangeProperty(definition)
      ? parseRangeEndpoint(definition, text)
      : Number(text)
    const endpoints: [number, number] = [...values]
    endpoints[index] = next
    if (
      !Number.isFinite(next) ||
      next < domain.min ||
      next > domain.max ||
      endpoints[0] > endpoints[1]
    )
      throw new Error('Choose an ordered range within the configured bounds')
    inputError = ''
    onChange(endpoints)
  } catch (error) {
    inputError = error instanceof Error ? error.message : 'Invalid range'
  }
}
</script>
<div class="w-full min-w-0">
  <div id={inputId} class="flex h-[72px] items-center">
    {#if !showInputs}
      <div
        class={`bits-feature-field__range pt-0! ${compact && isDay ? '[&_.rsPip--first_.rsPipVal]:left-3 [&_.rsPip--last_.rsPipVal]:-left-3' : ''} ${compact ? 'px-0!' : definition.dataType === 'dateRange' ? 'px-2!' : 'pl-0!'} ${!hasValue ? 'bits-feature-field__range--unset' : ''}`}
      >
        <RangeSlider
          min={domain.min}
          max={domain.max}
          step={definition.dataType === 'timeRange' ? timeStep : domain.step}
          bind:values={selected}
          {disabled}
          range
          pips
          first="label"
          last="label"
          rest="pip"
          pipstep={definition.dataType === 'timeRange' ? 60 / timeStep : domain.pipstep}
          formatter={format}
          ariaLabels={['Range start', 'Range end']}
          float
          on:change={() => onChange([selected[0], selected[1]])}
        />
      </div>
    {:else}
      <div class="mx-auto grid w-full max-w-sm min-w-0 grid-cols-2 gap-4">
        {#each [0, 1] as index}
          <div class="text-muted-foreground min-w-0 text-center text-xs">
            <span class="mb-1 block">{index === 0 ? 'From' : 'To'}</span>
            {#if isDay}
              <DatePicker
                value={format(values[index])}
                min={format(domain.min)}
                max={format(domain.max)}
                label={index === 0 ? 'Range start date' : 'Range end date'}
                {disabled}
                onChange={text => {
                  if (text) editEndpoint(index, text)
                  else onReset?.()
                }}
              />
            {:else}
              <input
                aria-label={index === 0 ? 'From' : 'To'}
                class="border-border/60 bg-foreground/4 text-foreground min-h-11 w-full rounded-lg border text-center text-sm"
                type="text"
                {disabled}
                value={format(values[index])}
                placeholder={definition.dataType === 'timeRange'
                  ? 'HH:MM'
                  : definition.dateResolution === 'month'
                    ? 'YYYY-MM'
                    : 'YYYY'}
                onchange={event => editEndpoint(index, event.currentTarget.value)}
              >
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
  {#if isRangeProperty(definition)}
    <div class={['flex items-center justify-center gap-3', compact ? 'pt-1' : 'pt-3']}>
      {#if onReset}
        <button
          type="button"
          class="text-muted-foreground hover:bg-primary/10 hover:text-primary flex size-8 items-center justify-center rounded disabled:opacity-30"
          disabled={!hasValue || disabled}
          aria-label="Reset range value"
          data-tooltip="Reset range"
          onclick={onReset}
        >
          <ResetIcon class="size-4" />
        </button>
      {/if}
      <button
        type="button"
        class="text-muted-foreground hover:bg-primary/10 hover:text-primary flex size-8 items-center justify-center rounded disabled:opacity-30"
        {disabled}
        aria-label={definition.dataType === 'dateRange'
          ? 'Toggle date inputs'
          : 'Toggle time inputs'}
        data-tooltip={definition.dataType === 'dateRange'
          ? 'Choose dates'
          : 'Enter times'}
        aria-expanded={showInputs}
        aria-controls={inputId}
        onclick={() => (showInputs = !showInputs)}
      >
        <CalendarIcon class="size-4" />
      </button>
      {#if definition.dataType === 'timeRange'}
        <Popover
          bind:open={showSettings}
          triggerProps={{
            'aria-label': 'Time snapping',
            'data-tooltip': 'Time snapping',
            role: 'button',
            tabindex: 0,
          }}
          triggerClass="flex size-8 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
          contentClass="z-[250] min-w-36 rounded-lg border border-border bg-panel p-1 text-foreground shadow-lg"
          contentProps={{ align: 'end' }}
        >
          {#snippet trigger()}
            <SettingsIcon class="size-4" />
          {/snippet}
          {#each [
            { value: 5, label: '5 minutes' },
            { value: 15, label: '15 minutes' },
            { value: 60, label: 'Whole hours' },
          ] as option}
            <button
              type="button"
              {disabled}
              class={`hover:bg-primary/10 block w-full rounded px-3 py-2 text-left text-sm ${timeStep === option.value ? 'bg-primary/10 text-primary' : ''}`}
              aria-pressed={timeStep === option.value}
              onclick={() => {
                timeStep = option.value
                showSettings = false
              }}
            >
              {option.label}
            </button>
          {/each}
        </Popover>
      {/if}
    </div>
  {/if}
  {#if showInputs}
    {#if definition.dataType === 'timeRange' && definition.timeMaxHour === 36}
      <p class="text-muted-foreground pb-2 text-xs">
        24:00 is midnight; 36:00 is noon the next day.
      </p>
    {/if}
    {#if inputError}
      <p role="alert" class="text-destructive text-xs">{inputError}</p>
    {/if}
  {/if}
</div>
