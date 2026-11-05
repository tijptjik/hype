<script lang="ts">
// COMPONENTS
import UserContributionPreviews from '#lib/bits/patterns/userDirectory/UserContributionPreviews.svelte'
// TYPES
import type { UserContributionPreview } from '#lib/users/contributionPreview.types.js'

let initialPreviews = $state<UserContributionPreview[] | undefined>(undefined)
const previews: UserContributionPreview[] = Array.from({ length: 7 }, (_, index) => ({
  id: `preview-${index}`,
  kind: 'feature',
  featureId: `feature-${index}`,
  imageId: null,
  image: null,
  title: `Neighbourhood contribution ${index + 1}`,
}))
</script>

<div class="bits-theme bg-panel text-foreground min-h-screen">
  <nav class="border-border flex gap-4 border-b p-4">
    <button type="button" onclick={() => (initialPreviews = previews)}>
      Show previews
    </button>
    <button type="button" onclick={() => (initialPreviews = undefined)}>
      Show loading
    </button>
  </nav>
  <div class="flex h-52 min-w-0">
    <UserContributionPreviews
      profile={{ id: 'fixture' }}
      {initialPreviews}
      onMore={() => {}}
    />
  </div>
</div>
