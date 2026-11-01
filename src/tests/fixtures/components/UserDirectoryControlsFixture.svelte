<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import UserDirectoryControls from '#lib/bits/patterns/userDirectory/UserDirectoryControls.svelte'
setResponsiveCtx()
let sorting = $state<{ sortBy: string; sortOrder: 'asc' | 'desc' }>({
  sortBy: 'createdAt',
  sortOrder: 'asc',
})
</script>
<main class="bits-theme min-h-screen bg-base-100 text-base-content">
  <UserDirectoryControls
    count={1689}
    archived={false}
    hasEmail={null}
    hasTelephone={null}
    {sorting}
    onArchivedChange={() => {}}
    onHasEmailChange={() => {}}
    onHasTelephoneChange={() => {}}
    onSortingChange={value => (sorting = value)}
    onReset={() => (sorting = { sortBy: 'createdAt', sortOrder: 'asc' })}
  />
  <output aria-label="Sort state">{sorting.sortBy}:{sorting.sortOrder}</output>
</main>
