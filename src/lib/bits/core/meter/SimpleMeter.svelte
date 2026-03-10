<script lang="ts">
// BITS-UI
import { Meter as MeterPrimitive } from 'bits-ui'
// SVELTE
import { onMount } from 'svelte'
import { cubicOut } from 'svelte/easing'
import { Tween } from 'svelte/motion'
// TYPES
import type { SimpleMeterProps } from './meter.types'

let {
  value = 0,
  max = 100,
  min = 0,
  label,
  valueLabel,
  class: className = '',
  indicatorClass = '',
  ...restProps
}: SimpleMeterProps = $props()

const tween = new Tween(0, {
  duration: 650,
  easing: cubicOut,
  delay: 220,
})

let hasMounted = $state(false)

const rootClasses = $derived(
  ['bits-theme', 'bits-meter', className].filter(Boolean).join(' '),
)

const indicatorClasses = $derived(
  ['bits-theme', 'bits-meter__indicator', indicatorClass].filter(Boolean).join(' '),
)

const normalizedValue = $derived.by(() => {
  const safeMin = Number.isFinite(min) ? min : 0
  const safeMax = Number.isFinite(max) && max > safeMin ? max : 100
  const safeValue = Number.isFinite(value) ? value : safeMin

  return Math.min(safeMax, Math.max(safeMin, safeValue))
})

const targetPercent = $derived.by(() => {
  const range = max - min
  if (range <= 0) return 0

  return ((normalizedValue - min) / range) * 100
})

onMount(() => {
  hasMounted = true
  void tween.set(0, { duration: 0 })
  void tween.set(targetPercent)
})

$effect(() => {
  if (!hasMounted) return
  void tween.set(targetPercent)
})
</script>

<MeterPrimitive.Root
  {...restProps}
  {value}
  {max}
  {min}
  class={rootClasses}
  aria-label={label}
  aria-valuetext={valueLabel}
>
  <div
    class={indicatorClasses}
    style={`transform: translateX(-${100 - tween.current}%)`}
  ></div>
</MeterPrimitive.Root>
