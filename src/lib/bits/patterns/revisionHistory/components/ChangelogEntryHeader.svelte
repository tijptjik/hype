<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { onMount } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// ICONS
import MetadataIcon from 'virtual:icons/proicons/database'
// COMPONENTS
import ChangelogActor from './ChangelogActor.svelte'
// TYPES
import type { ChangelogEntry } from '#lib/revisions/changelog.js'

let {
  entry,
  relativeTime,
  exactTime,
}: {
  entry: ChangelogEntry
  relativeTime: string
  exactTime: string
} = $props()
let metadataOpen = $state(false)
let reducedMotion = $state(false)
const metadataId = $props.id()
onMount(() => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  const update = (): void => {
    reducedMotion = query.matches
  }
  update()
  query.addEventListener('change', update)
  return () => query.removeEventListener('change', update)
})
const sources: Record<string, string> = {
  user: 'User',
  system: 'System',
  migration: 'Migration',
  import: 'Import',
  restore: 'Restore',
}
const labelClass = 'text-xs font-medium text-muted-foreground'
const reasonLabel = $derived(entry.baseline ? 'Legacy baseline' : entry.reason)
</script>

<header data-changelog-entry-header class="relative grid min-w-0 gap-4">
  <Button
    text="Metadata"
    iconComponent={MetadataIcon}
    iconClasses="size-4! [&_svg]:size-4!"
    hideLabel
    hideLabelInstantly
    style="ghost"
    color="neutral"
    class="absolute top-0 right-0 size-9! p-0!"
    attrs={{
      'aria-expanded': metadataOpen,
      'aria-pressed': metadataOpen,
      'aria-controls': metadataId,
    }}
    onClick={() => {
      metadataOpen = !metadataOpen
    }}
  />
  <dl
    class="flex min-w-0 flex-wrap items-start justify-start gap-y-3 pr-12"
    style:column-gap="48px"
  >
    <div class="max-w-[min(100%,480px)] min-w-0 flex-none space-y-1">
      <dt class={labelClass}>Changed</dt>
      <dd>
        <time
          datetime={entry.createdAt}
          title={exactTime}
          class="block text-sm font-medium"
        >
          {relativeTime}
        </time>
      </dd>
    </div>
    <div class="max-w-[min(100%,480px)] min-w-0 flex-none space-y-1">
      <dt class={labelClass}>Actor</dt>
      <dd class="min-w-0 break-words"><ChangelogActor {entry} prominent /></dd>
    </div>
    <div class="max-w-[min(100%,480px)] min-w-0 flex-none space-y-1">
      <dt class={labelClass}>Source</dt>
      <dd class="text-sm font-medium break-words">
        {sources[entry.origin] ?? entry.origin}
      </dd>
    </div>
    {#if reasonLabel}
      <div class="max-w-[min(100%,480px)] min-w-0 flex-none space-y-1">
        <dt class={labelClass}>Reason</dt>
        <dd class="break-words whitespace-pre-wrap">{reasonLabel}</dd>
      </div>
    {/if}
  </dl>
  <div
    data-changelog-record-details
    id={metadataId}
    class="text-muted-foreground contents text-xs"
  >
    {#if metadataOpen}
      <div transition:slide={{ duration: reducedMotion ? 0 : 200 }}>
        <dl class="grid min-w-0 gap-x-6 gap-y-2 pt-2 @[32rem]:grid-cols-2">
          <div class="min-w-0 space-y-1">
            <dt class="font-medium">Actor ID</dt>
            <dd class="font-mono break-words">
              {entry.baselineActor?.actorId ?? entry.actorId}
            </dd>
          </div>
          {#if entry.baselineActor}
            <div class="min-w-0 space-y-1">
              <dt class="font-medium">Snapshot recorder</dt>
              <dd class="font-mono break-words">{entry.actorId}</dd>
            </div>
          {/if}
        </dl>
      </div>
    {/if}
  </div>
</header>
