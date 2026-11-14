<script lang="ts">
let {
  matched,
  skipped,
  total,
  unavailable,
  onclick,
  onmatched,
}: {
  matched: number
  skipped: number
  total: number
  unavailable: number
  onclick: () => void
  onmatched: () => void
} = $props()

const matchedCount = $derived(Math.min(total, Math.max(0, matched)))
const unavailableCount = $derived(
  Math.min(total - matchedCount, Math.max(0, unavailable)),
)
const skippedCount = $derived(
  Math.min(total - matchedCount - unavailableCount, Math.max(0, skipped)),
)
const remaining = $derived(total - matchedCount - unavailableCount - skippedCount)
const reviewed = $derived(matchedCount + unavailableCount)
const percent = $derived(total > 0 ? Math.round((reviewed / total) * 100) : 0)
</script>

<section
  class="flex shrink-0 items-center gap-3 px-3"
  aria-label="Reconciliation progress"
>
  <div class="flex shrink-0 flex-col gap-1 tabular-nums">
    <span class="text-3xl leading-none font-semibold">{percent}%</span>
    <span class="text-muted-foreground text-[10px] whitespace-nowrap"
      >{reviewed}
      / {total} reviewed</span
    >
  </div>
  <div class="flex min-w-64 flex-col gap-1.5">
    <div class="flex items-center gap-2 text-[10px] whitespace-nowrap tabular-nums">
      <button
        type="button"
        onclick={onmatched}
        class="flex items-center gap-1 underline-offset-2 hover:underline"
      >
        <span class="size-1.5 rounded-full bg-emerald-500"></span>{matchedCount}
        matched
      </button>
      <span
        class="flex items-center gap-1"
        title="Skipped this session; still awaiting review"
      >
        <span class="size-1.5 rounded-full bg-amber-400"></span>{skippedCount}
        skipped
      </span>
      <button
        type="button"
        {onclick}
        class="flex items-center gap-1 underline-offset-2 hover:underline"
      >
        <span class="size-1.5 rounded-full bg-sky-500"></span>{unavailableCount}
        unavailable
      </button>
      <span class="text-muted-foreground flex items-center gap-1">
        <span class="size-1.5 rounded-full bg-slate-300"></span>{remaining}
        remaining
      </span>
    </div>
    <div
      class="flex h-2 w-full overflow-hidden rounded-full bg-slate-300"
      role="progressbar"
      aria-label="Reviewed records"
      aria-valuemin={0}
      aria-valuemax={Math.max(total, 1)}
      aria-valuenow={reviewed}
      aria-valuetext={`${matchedCount} matched, ${skippedCount} skipped, ${unavailableCount} unavailable, ${remaining} remaining out of ${total}`}
    >
      <span
        class="h-full bg-emerald-500"
        style:width={`${(matchedCount / Math.max(total, 1)) * 100}%`}
      ></span>
      <span
        class="h-full bg-amber-400"
        style:width={`${(skippedCount / Math.max(total, 1)) * 100}%`}
      ></span>
      <span
        class="h-full bg-sky-500"
        style:width={`${(unavailableCount / Math.max(total, 1)) * 100}%`}
      ></span>
    </div>
  </div>
</section>
