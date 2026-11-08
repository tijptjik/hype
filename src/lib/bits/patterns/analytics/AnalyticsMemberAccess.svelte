<script lang="ts">
// BITS
import Checkbox from '#lib/bits/custom/checkbox/Checkbox.svelte'

let {
  rows,
  isEditing = false,
  onChange,
}: {
  rows: Array<{ userId: string; name: string; enabled: boolean }>
  isEditing?: boolean
  onChange: (params: { userId: string; value: boolean }) => void
} = $props()
const id = $props.id()
</script>

<section class="flex min-w-0 flex-col gap-3">
  <div class="space-y-1">
    <h2 class="text-lg font-semibold">Analytics access</h2>
    <p class="text-foreground-alt text-sm break-words whitespace-normal">
      Owners have access automatically. Members can be granted analytics for this
      organisation and its projects.
    </p>
  </div>
  {#each rows as row (row.userId)}
    <div
      class="border-foreground/10 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b py-3"
    >
      <label for={`${id}-${row.userId}`} class="min-w-0 break-words whitespace-normal">
        <span class="block text-sm font-semibold">{row.name}</span>
        <span class="text-foreground-alt text-xs">View analytics</span>
      </label>
      <Checkbox
        id={`${id}-${row.userId}`}
        checked={row.enabled}
        disabled={!isEditing}
        onCheckedChange={value => onChange({ userId: row.userId, value })}
      />
    </div>
  {/each}
</section>
