<script lang="ts">
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

{#if isUser && actor.actorUsername}
  <a
    href={`/admin/users/${encodeURIComponent(actor.actorUsername)}`}
    class="{prominent
      ? 'text-foreground text-sm font-medium'
      : 'text-muted-foreground text-xs'} hover:text-primary focus-visible:outline-primary min-w-0 rounded-sm break-words hover:underline focus-visible:outline-2"
    title={actor.actorName ? `${actor.actorName} · ${actor.actorId}` : actor.actorId}
    onclick={event => event.stopPropagation()}
    >@{actor.actorDisplayUsername || actor.actorUsername}</a
  >
{:else}
  <span
    class="{prominent
      ? 'text-foreground text-sm font-medium'
      : 'text-muted-foreground text-xs'} min-w-0 break-words"
    title={actor.actorId}
  >
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
