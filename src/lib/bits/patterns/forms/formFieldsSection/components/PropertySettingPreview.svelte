<script lang="ts">
let { value }: { value: string } = $props()
const examples: Record<string, string> = {
  text: 'Abc',
  number: '123.45',
  date: '2026-10-20',
  boolean: 'True / False',
  decade: '2020–2029',
  year: '2026',
  month: '2026-10',
  day: '2026-10-20',
  '24': '00:00 → 24:00',
  '36': '00:00 → 36:00',
  one: '↗',
  many: '↗   ↗   ↗',
  numberedReferences: '1   2   3',
  labelledLinks: 'Read more ↗',
}
</script>

<!-- Examples are decorative; the select supplies the accessible option name. -->
<svg
  class="h-7 w-full min-w-0 text-secondary dark:brightness-150"
  aria-hidden="true"
  focusable="false"
>
  <rect
    x="1%"
    y="2"
    width="98%"
    height="24"
    rx="4"
    fill="var(--color-primary)"
    fill-opacity=".08"
    stroke="currentColor"
    opacity=".7"
  />
  <text
    x="50%"
    y="18"
    text-anchor="middle"
    fill="var(--color-accent)"
    font-size="11"
    font-family="inherit"
    opacity=".75"
  >
    {examples[value] ?? value}
  </text>
</svg>
