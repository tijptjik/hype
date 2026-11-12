<script lang="ts">
// TYPES
let {
  participants,
  organisationId = null,
}: {
  participants: { locationId: string; side: string; label?: string }[]
  organisationId?: string | null
} = $props()
const uid = $props.id()
const before = $derived(participants.filter(item => item.side === 'before'))
const after = $derived(participants.filter(item => item.side === 'after'))
/** Position one connector at the middle of its row.
 * @param index Row position.
 * @param count Number of participants on this side.
 * @returns Vertical coordinate within the diagram's viewbox.
 */
function position(index: number, count: number): number {
  return ((index + 0.5) / count) * 100
}
</script>

<fieldset
  class="grid min-w-0 grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] gap-x-2 gap-y-2"
  aria-label="Locations before and after the change"
  data-lineage-before={before.length}
  data-lineage-after={after.length}
>
  <span class="text-muted-foreground text-xs">Before</span>
  <span></span>
  <span class="text-muted-foreground text-xs">After</span>
  <div class="grid min-w-0 auto-rows-fr gap-3">
    {#each before as item (item.locationId)}
      <a
        class="border-border bg-background/40 flex min-h-12 min-w-0 items-center rounded-lg border px-3 py-2 text-sm font-medium break-words whitespace-normal hover:underline"
        href={`/admin/locations/${encodeURIComponent(item.locationId)}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`}
        >{item.label ?? item.locationId}</a
      >
    {/each}
  </div>
  <svg
    class="text-primary h-full min-h-12 w-full self-stretch overflow-visible"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <marker
        id={uid}
        markerWidth="6"
        markerHeight="6"
        refX="5"
        refY="3"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L6,3 L0,6" fill="none" stroke="currentColor" />
      </marker>
    </defs>
    {#each before as _, index}
      <path
        d={`M 0 ${position(index, before.length)} C 35 ${position(index, before.length)}, 35 50, 50 50`}
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    {/each}
    {#each after as _, index}
      <path
        d={`M 50 50 C 65 50, 65 ${position(index, after.length)}, 95 ${position(index, after.length)}`}
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
        marker-end={`url(#${uid})`}
      />
    {/each}
  </svg>
  <div class="grid min-w-0 auto-rows-fr gap-3">
    {#each after as item (item.locationId)}
      <a
        class="border-border bg-background/40 flex min-h-12 min-w-0 items-center rounded-lg border px-3 py-2 text-sm font-medium break-words whitespace-normal hover:underline"
        href={`/admin/locations/${encodeURIComponent(item.locationId)}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`}
        >{item.label ?? item.locationId}</a
      >
    {/each}
  </div>
</fieldset>
