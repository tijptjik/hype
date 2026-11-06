<script lang="ts">
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import { Popover } from '#lib/bits/core/popover/index.js'
import Search from '#lib/bits/custom/search/Search.svelte'
// UTILS
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
// ICONS
import SearchIcon from 'virtual:icons/proicons/search'
import ClearIcon from 'virtual:icons/proicons/cancel'
// TYPES
import type {
  ChangelogFilterOptions,
  ChangelogFilters,
} from '#lib/revisions/changelog.js'

type Actor = ChangelogFilterOptions['actors'][number]
let {
  actors,
  value,
  onChange,
}: {
  actors: Actor[]
  value: ChangelogFilters['actor']
  onChange: (actor: ChangelogFilters['actor']) => void
} = $props()
let open = $state(false)
const selected = $derived(
  value
    ? actors.find(actor => actor.id === value.id && actor.origin === value.origin)
    : undefined,
)
const label = $derived(selected?.label ?? value?.id ?? 'All actors')
const excluded = $derived(value ? [JSON.stringify([value.origin, value.id])] : [])

/** Search the complete authorized attribution list using the organisation user-search UI.
 * @param query Name, username, display handle or immutable actor identity.
 * @returns Up to twenty matching actors without querying unrelated users.
 * @remarks Missing user profiles and system origins retain their recorded identity.
 */
async function searchActors(query: string): Promise<Actor[]> {
  const needle = query.trim().replace(/^@/, '').toLocaleLowerCase()
  return actors
    .filter(actor =>
      [actor.name, actor.username, actor.displayUsername, actor.label, actor.id].some(
        value => value?.toLocaleLowerCase().includes(needle),
      ),
    )
    .slice(0, 20)
}
</script>

<div class="flex items-center gap-3">
  <span class="text-foreground/72 text-sm font-medium">Actor</span>
  <!-- Search owns Tab-to-result navigation; this picker stays non-modal. -->
  <Popover
    bind:open
    triggerProps={{
      role: 'button',
      tabindex: 0,
      'aria-label': value ? `Change actor: ${label}` : 'Search actors',
    }}
    triggerClass="flex h-10 min-w-48 cursor-pointer items-center justify-between gap-3 rounded-full border border-foreground/10 bg-base-300/95 px-4 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-focus"
    contentProps={{ align: 'start', trapFocus: false }}
    contentClass="z-[250] w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-panel p-3 text-foreground shadow-lg"
  >
    {#snippet trigger()}
      <span>{label}</span>
      <SearchIcon class="size-4 shrink-0" aria-hidden="true" />
    {/snippet}
    <Search
      placeholder="Search actors by name or username"
      focusOnMount={true}
      initialResults={actors.slice(0, 20)}
      onInput={searchActors}
      excludeIds={excluded}
      getItemId={actor => JSON.stringify([actor.origin, actor.id])}
      resultMap={{
        image: actor => resolveAvatarImageSrc(actor.image),
        title: actor => actor.name || actor.label,
        descriminator: actor =>
          actor.username ? `@${actor.displayUsername || actor.username}` : null,
      }}
      noResultsText="No matching actors in this changelog."
      resultsLayout="inline"
      barClass="mb-0"
      class="w-full"
      onSelect={actor => {
        onChange({ id: actor.id, origin: actor.origin })
        open = false
      }}
    />
  </Popover>
  {#if value}
    <Button
      text="Clear actor"
      iconComponent={ClearIcon}
      hideLabel={true}
      style="ghost"
      size="sm"
      onClick={() => onChange(undefined)}
    />
  {/if}
</div>
