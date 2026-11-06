<script lang="ts">
// TYPES
import type { ChangelogEntry } from '#lib/revisions/changelog.js'

let {
  entry,
}: {
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

{#if isUser && actor.actorUsername}
  <a
    href={`/admin/users/${encodeURIComponent(actor.actorUsername)}`}
    class="text-muted-foreground hover:text-primary focus-visible:outline-primary min-w-0 rounded-sm text-xs break-words hover:underline focus-visible:outline-2"
    title={actor.actorName ? `${actor.actorName} · ${actor.actorId}` : actor.actorId}
    onclick={event => event.stopPropagation()}
    >@{actor.actorDisplayUsername || actor.actorUsername}</a
  >
{:else}
  <span class="text-muted-foreground min-w-0 text-xs break-words" title={actor.actorId}>
    {isUser
      ? actor.actorName || actor.actorId
      : (labels[entry.origin] ?? actor.actorId)}
  </span>
{/if}

{#if entry.baselineActor}
  <span class="text-muted-foreground text-xs"
    >({entry.baselineActor.role === 'reviewer' ? 'Reviewer' : 'Contributor'})</span
  >
{/if}
