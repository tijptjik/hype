<script lang="ts">
// DOMAIN
import { propertyOptionIcon } from '../../../../src/lib/properties/optionIcons'
let {
  id,
  path,
  compact = false,
}: { id?: string | null; path?: string; compact?: boolean } = $props()
let symbol = $derived(propertyOptionIcon(id))
let glyph = $derived(path ?? symbol?.path)
</script>

{#if glyph}
  <span
    aria-hidden="true"
    class={[
      'inline-grid shrink-0 place-items-center rounded-md',
      compact ? 'size-5' : 'size-6',
    ]}
    style:background-color={symbol?.tint}
    style:color={symbol?.color}
  >
    <!-- biome-ignore lint/a11y/noSvgWithoutTitle: The labelled option owns the accessible name; this entire span is decorative. -->
    <svg
      width={compact ? 16 : 20}
      height={compact ? 16 : 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={glyph} />
    </svg>
  </span>
{/if}
