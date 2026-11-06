<script lang="ts">
// BITS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ContributedFeatures from '#lib/bits/patterns/panels/sections/contributedFeatures/ContributedFeaturesSection.svelte'
import ContributedImages from '#lib/bits/patterns/panels/sections/contributedImages/ContributedImagesSection.svelte'
import UserContributionPreviews from './UserContributionPreviews.svelte'
// UTILS
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
// ICONS
import PersonIcon from 'virtual:icons/proicons/person'
// TYPES
import type { AdminUserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

let {
  data,
  model,
  showIdentity = true,
}: {
  data: AdminUserProfile
  model: UserContributionsModel
  showIdentity?: boolean
} = $props()
const avatar = $derived(resolveAvatarImageSrc(data.profile.image))
let expandedProfileId = $state<string | null>(null)
const showHistory = $derived(!showIdentity || expandedProfileId === data.profile.id)
const stats = $derived([
  {
    label: 'Contributed features',
    count: Object.values(data.profile.contributedFeatures).reduce(
      (sum, ids) => sum + ids.length,
      0,
    ),
  },
  {
    label: 'Contributed photos',
    count: Object.values(data.profile.contributedImages).reduce(
      (sum, ids) => sum + ids.length,
      0,
    ),
  },
  { label: 'Missing-place reports', count: data.profile.reportedMissingCount },
  { label: 'Feature submissions', count: data.profile.newFeatureCount },
  { label: 'Photo submissions', count: data.profile.newPhotoCount },
])
</script>

<div
  class="grid w-full min-w-0 {showIdentity
    ? 'mx-auto max-w-7xl items-start gap-6 xl:grid-cols-[minmax(17rem,1fr)_minmax(0,2fr)]'
    : 'min-h-0 flex-1 overflow-auto'}"
>
  {#if showIdentity}
    <FormSurface class="border-border min-w-0 rounded-xl border p-6">
      <section aria-label="Profile details" class="space-y-6">
        <div class="flex items-center gap-4">
          <div
            class="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          >
            {#if avatar}
              <img
                src={avatar}
                alt=""
                class="size-full object-cover"
                referrerpolicy="no-referrer"
              >
            {:else}
              <PersonIcon class="text-muted-foreground size-10" />
            {/if}
          </div>
          <div class="min-w-0">
            <h1 class="text-xl font-semibold break-words">
              {data.details?.name ||
                data.profile.attribution ||
                data.profile.displayUsername ||
                data.profile.username}
            </h1>
            <p class="text-muted-foreground text-sm break-all">
              @{data.profile.displayUsername || data.profile.username}
            </p>
          </div>
        </div>
        <dl class="space-y-4 text-sm">
          <div>
            <dt class="text-muted-foreground">Attribution</dt>
            <dd class="break-words">{data.profile.attribution || 'Not provided'}</dd>
          </div>
          {#if data.details}
            {#if data.details.email}
              <div>
                <dt class="text-muted-foreground">Email</dt>
                <dd class="break-all">{data.details.email}</dd>
              </div>
            {/if}
            {#if data.details.telephone}
              <div>
                <dt class="text-muted-foreground">Phone</dt>
                <dd>{data.details.telephone}</dd>
              </div>
            {/if}
            <div>
              <dt class="text-muted-foreground">Language</dt>
              <dd>{data.details.locale}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Account status</dt>
              <dd>{data.details.isArchived ? 'Archived' : 'Active'}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Joined</dt>
              <dd>{new Date(data.details.createdAt).toLocaleDateString()}</dd>
            </div>
          {/if}
        </dl>
        {#if !data.details}
          <p class="text-muted-foreground text-sm">
            Contact and account details are restricted for your role.
          </p>
        {/if}
      </section>
    </FormSurface>
  {/if}
  <div class="@container flex min-h-0 min-w-0 flex-col">
    <section aria-label="Contributions" class="flex min-h-0 flex-1 flex-col">
      <div class="border-border shrink-0 border-b p-6">
        <dl class="grid grid-cols-2 gap-4 @xl:grid-cols-3 @3xl:grid-cols-5">
          {#each stats as stat (stat.label)}
            <div class="bg-muted/40 rounded-lg p-3">
              <dt class="text-muted-foreground text-xs">{stat.label}</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums">
                {stat.count.toLocaleString()}
              </dd>
            </div>
          {/each}
        </dl>
      </div>
      {#if showHistory}
        <div class="grid min-w-0 flex-1 @3xl:min-h-0 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div class="border-border min-w-0 @3xl:min-h-0 @3xl:border-r">
            <ContributedFeatures userData={data.profile} {model} layout="dashboard" />
          </div>
          <div class="min-w-0 @3xl:min-h-0">
            <ContributedImages userData={data.profile} {model} fillHeight />
          </div>
        </div>
      {:else}
        <div class="flex h-52 min-w-0">
          <UserContributionPreviews
            profile={data.profile}
            initialPreviews={data.contributionPreviews}
            onMore={() => (expandedProfileId = data.profile.id)}
          />
        </div>
      {/if}
    </section>
  </div>
</div>
