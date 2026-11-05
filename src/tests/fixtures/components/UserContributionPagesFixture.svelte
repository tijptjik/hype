<script lang="ts">
// COMPONENTS
import ContributedFeatures from '#lib/bits/patterns/panels/sections/contributedFeatures/ContributedFeaturesSection.svelte'
import ContributedImages from '#lib/bits/patterns/panels/sections/contributedImages/ContributedImagesSection.svelte'
// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

let release!: () => void
const ready = new Promise<void>(resolve => {
  release = resolve
})
let featureCalls = $state(0)
let photoCalls = $state(0)
const profile = {
  id: 'fixture',
  username: 'fixture',
  contributedFeatures: {
    project: Array.from({ length: 25 }, (_, i) => `feature-${i}`),
  },
  contributedImages: { project: Array.from({ length: 30 }, (_, i) => `photo-${i}`) },
} as unknown as UserProfile
const model = {
  getFeatures: async (_id: string, ids: string[]) => {
    featureCalls++
    await ready
    return ids.map(id => ({ id, createdAt: '2026-11-01', projectId: 'project' }))
  },
  getImages: async (_id: string, ids: string[]) => {
    photoCalls++
    await ready
    return ids.map(id => ({
      ctxType: 'feature',
      ctxId: `feature-${id}`,
      image: {
        id,
        cdn: 'cloudflareR2',
        env: 'local',
        publicId: `fixtures/${id}`,
        version: 1,
        createdAt: '2026-11-01',
      },
    }))
  },
  getHierarchy: async () => ({}),
  getProjectHierarchy: async () => ({}),
  getOrganisationName: () => 'Community',
  getProjectName: () => 'Neighbourhood places',
  getProjectTitle: () => 'Neighbourhood places',
  getFeatureName: (feature: { id: string }) => `Contribution ${feature.id}`,
  getFeatureAddress: () =>
    'A long street address that should remain readable on a narrow screen',
  onContributedFeature: () => {},
  onContributedImage: () => {},
} as unknown as UserContributionsModel
</script>

<div class="bits-theme bg-panel text-foreground min-h-screen">
  <nav class="border-border flex gap-4 border-b p-4">
    <button type="button" onclick={() => release()}>Finish loading</button>
    <span data-calls>{featureCalls} feature / {photoCalls} photo calls</span>
  </nav>
  <main class="mx-auto max-w-3xl">
    <ContributedFeatures userData={profile} {model} />
    <ContributedImages userData={profile} {model} />
  </main>
</div>
