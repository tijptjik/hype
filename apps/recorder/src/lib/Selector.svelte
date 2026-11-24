<script lang="ts">
// TYPES
import type { RecorderOption } from '../../../../src/lib/fieldResearch/recorder'

let {
  label,
  options,
  value,
  onchange,
  disabled = false,
}: {
  label: string
  options: RecorderOption[]
  value: string
  onchange: (id: string) => void
  disabled?: boolean
} = $props()
let select: HTMLSelectElement
let startY: number | null = null
let swiped = false

function step(direction: number): void {
  const index = options.findIndex(option => option.id === value)
  const next = options[Math.max(0, Math.min(index + direction, options.length - 1))]
  if (!disabled && next && next.id !== value) onchange(next.id)
}
</script>

<label
  class="relative grid min-h-20 min-w-0 content-center gap-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 focus-within:border-slate-300"
>
  <span class="text-xs font-medium text-slate-400">{label}</span>
  <span class="flex items-center justify-between gap-3 font-semibold">
    <span class="min-w-0 break-words"
      >{options.find(option => option.id === value)?.name ??
        `Choose ${label.toLowerCase()}`}</span
    >
    <span aria-hidden="true" class="text-slate-400">⌄</span>
  </span>
  <select
    bind:this={select}
    {disabled}
    aria-label={label}
    {value}
    class="absolute inset-0 h-full w-full touch-none opacity-0"
    onchange={() => onchange(select.value)}
    ontouchstart={event => {
      startY = event.touches.length === 1 ? event.touches[0].clientY : null
      swiped = false
    }}
    ontouchcancel={() => {
      startY = null
    }}
    ontouchend={event => {
      if (startY !== null) {
        const delta = event.changedTouches[0].clientY - startY
        if (Math.abs(delta) >= 24) {
          event.preventDefault()
          swiped = true
          step(delta < 0 ? 1 : -1)
        }
      }
      startY = null
    }}
    onclick={event => {
      if (swiped) {
        event.preventDefault()
        swiped = false
      }
    }}
    onkeydown={() => {
      swiped = false
    }}
  >
    {#if !value}
      <option value="" disabled>Choose {label.toLowerCase()}</option>
    {/if}
    {#each options as option (option.id)}
      <option value={option.id}>{option.name}</option>
    {/each}
  </select>
</label>
