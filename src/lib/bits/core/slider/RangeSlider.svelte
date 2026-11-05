<script lang="ts">
// BITS UI
import { Slider } from 'bits-ui'

let {
  value = $bindable([0, 100]),
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  labels = ['Range start', 'Range end'],
  formatValue = String,
  onCommit,
}: {
  value?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  labels?: [string, string]
  formatValue?: (value: number) => string
  onCommit?: (value: number[]) => void
} = $props()
</script>

<Slider.Root
  type="multiple"
  bind:value
  {min}
  {max}
  {step}
  {disabled}
  autoSort={false}
  onValueCommit={onCommit}
  class="relative flex h-6 w-full touch-none items-center select-none data-[disabled]:opacity-40"
>
  {#snippet children({ thumbItems })}
    <span class="bg-base-content/15 absolute inset-x-0 h-1.5 rounded-full"></span>
    <Slider.Range class="bg-primary/65 absolute h-1.5 rounded-full" />
    {#each thumbItems as thumb (thumb.index)}
      <Slider.Thumb
        index={thumb.index}
        aria-label={labels[thumb.index]}
        aria-valuetext={formatValue(thumb.value)}
        class="border-primary bg-panel focus-visible:ring-focus absolute top-1/2 -mt-2 size-4 rounded-full border-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      />
    {/each}
  {/snippet}
</Slider.Root>
