<script lang="ts">
// ICONS
import Building from 'virtual:icons/lucide/building-2'

let {
  framed = false,
  src,
  fallbackSrcs = [],
  class: className = 'size-7',
}: {
  framed?: boolean
  src?: string | null
  fallbackSrcs?: string[]
  class?: string
} = $props()
let failedSources = $state<string[]>([])
const sourceKey = $derived(JSON.stringify([src, ...fallbackSrcs]))
// Reset failures when the record or uploaded logo changes, not when an array is rebuilt.
$effect(() => {
  sourceKey
  failedSources = []
})
const displayedSrc = $derived(
  [src, ...fallbackSrcs].find(value => value && !failedSources.includes(value)),
)
/** Advance past the actual failed URL, including errors arriving after a source change.
 * @param event Failed image load. @returns Nothing.
 */
function handleError(event: Event): void {
  const failed = (event.currentTarget as HTMLImageElement).getAttribute('src')
  if (failed) failedSources = [...failedSources, failed]
}
</script>

<span
  class={framed
    ? 'border-border bg-muted/20 inline-flex shrink-0 items-center justify-center rounded-lg border p-2'
    : 'contents'}
>
  {#if displayedSrc}
    <img
      src={displayedSrc}
      alt=""
      class={`${className} shrink-0 object-contain`}
      onerror={handleError}
    >
  {:else}
    <Building class={`${className} text-muted-foreground shrink-0`} />
  {/if}
</span>
