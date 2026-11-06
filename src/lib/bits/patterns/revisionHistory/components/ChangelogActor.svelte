<script lang="ts">
// COMPONENTS
import HistoryActorIdentity from './HistoryActorIdentity.svelte'
// TYPES
import type { ChangelogEntry } from '#lib/revisions/changelog.js'

let {
  entry,
  prominent = false,
}: {
  prominent?: boolean
  entry: Pick<
    ChangelogEntry,
    | 'actorId'
    | 'actorName'
    | 'actorUsername'
    | 'actorDisplayUsername'
    | 'origin'
    | 'baselineActor'
  >
} = $props()
let actor = $derived(entry.baselineActor ?? entry)
let isUser = $derived(Boolean(entry.baselineActor) || entry.origin === 'user')
const labels: Record<string, string> = {
  system: 'System',
  migration: 'Author unknown',
  import: 'Import',
  restore: 'Restore',
}
</script>

<HistoryActorIdentity
  username={isUser ? actor.actorUsername : undefined}
  label={isUser
    ? actor.actorUsername
      ? `@${actor.actorDisplayUsername || actor.actorUsername}`
      : actor.actorName || actor.actorId
    : (labels[entry.origin] ?? actor.actorId)}
  tooltip={isUser && actor.actorName
    ? `${actor.actorName} · ${actor.actorId}`
    : actor.actorId}
  class={prominent
    ? 'text-foreground text-sm font-medium'
    : 'text-muted-foreground text-xs'}
/>

{#if entry.baselineActor}
  <span class="text-muted-foreground text-xs"
    >({entry.baselineActor.role === 'reviewer' ? 'Reviewer' : 'Contributor'})</span
  >
{/if}
