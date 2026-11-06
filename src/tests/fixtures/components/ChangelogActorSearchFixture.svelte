<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import ChangelogActorSearch from '#lib/bits/patterns/revisionHistory/components/ChangelogActorSearch.svelte'
// TYPES
import type { ChangelogFilters } from '#lib/revisions/changelog.js'
setResponsiveCtx()
let value = $state<ChangelogFilters['actor']>()
</script>

<div class="bits-theme bg-background text-foreground min-h-screen p-4">
  <ChangelogActorSearch
    actors={[
      {
        id: 'editor',
        origin: 'user',
        name: 'Example editor',
        username: 'example.editor',
        displayUsername: 'Example.Editor',
        label: 'Example editor',
        image: 'https://lh3.googleusercontent.com/example-avatar',
      },
      {
        id: 'system',
        origin: 'system',
        name: null,
        username: null,
        displayUsername: null,
        label: 'System',
      },
    ]}
    {value}
    onChange={next => (value = next)}
  />
  <output data-selected>{value?.id ?? 'none'}</output>
</div>
