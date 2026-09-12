<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { cubicOut } from 'svelte/easing'
import { Tween } from 'svelte/motion'
// BITS-UI
import { Meter as MeterPrimitive } from 'bits-ui'
// STYLES
import { cx } from '$lib/bits/utils'
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
  cx('bits-theme relative overflow-hidden rounded-full bg-dark-10', className),
)

const indicatorClasses = $derived(
  cx('bits-theme block w-full h-full rounded-[inherit] bg-foreground', indicatorClass),
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
