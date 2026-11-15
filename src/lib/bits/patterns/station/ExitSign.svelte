<script lang="ts">
let {
  label,
  x = 0,
  y = 0,
  textScale = 1,
  selected = false,
}: {
  label: string
  x?: number
  y?: number
  textScale?: number
  selected?: boolean
} = $props()
const point = $derived([x, y])
const code = $derived(/^([A-Z])([0-9]+[A-Z]?)?$/.exec(label))
const suffix = $derived(code?.[2] ?? '')
// D6/G2 bowls and the N's side bearing need closer subscripts for optical balance.
const suffixGap = $derived(
  label === 'D6' ? -1 : label === 'G2' ? -0.8 : code?.[1] === 'N' ? -0.7 : 0.8,
)
const width = $derived((code ? 32 : Math.max(32, label.length * 7 + 14)) * textScale)
</script>

<rect
  data-exit-background
  x={point[0] - width / 2}
  y={point[1] - 16 * textScale}
  {width}
  height={32 * textScale}
  rx={3 * textScale}
  fill="#28786a"
  stroke={selected ? 'var(--theme-primary, #155e75)' : 'none'}
  stroke-width={selected ? 3 : 0}
  vector-effect="non-scaling-stroke"
/>
<rect
  x={point[0] - width / 2 + 3 * textScale}
  y={point[1] - 13 * textScale}
  width={width - 6 * textScale}
  height={26 * textScale}
  rx={2.5 * textScale}
  fill="none"
  stroke="white"
  stroke-width={1.25 * textScale}
  pointer-events="none"
/>
<!-- One loaded typeface and one fixed badge size keep all exit codes consistent.
     A single anchored text run centres the whole pair; the suffix follows the letter's natural width.
     Zero-size parent text prevents formatting whitespace from widening the gap. -->
<text
  x={point[0]}
  y={point[1] + (code ? 7.5 : 4) * textScale}
  text-anchor="middle"
  font-size="0"
  font-family="Geologica, sans-serif"
  font-weight="400"
  fill="white"
  pointer-events="none"
>
  <tspan data-exit-letter font-size={(code ? 22 : 11) * textScale}>
    {code ? code[1] : label}
  </tspan>
  {#if suffix}
    <tspan
      data-exit-suffix
      dx={suffixGap * textScale}
      dy={0.5 * textScale}
      font-size={(suffix.length > 1 ? 8 : 10) * textScale}
    >
      {suffix}
    </tspan>
  {/if}
</text>
