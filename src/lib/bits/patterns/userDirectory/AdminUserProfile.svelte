<script lang="ts">
// BITS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ContributedFeatures from '#lib/bits/patterns/panels/sections/contributedFeatures/ContributedFeaturesSection.svelte'
import ContributedImages from '#lib/bits/patterns/panels/sections/contributedImages/ContributedImagesSection.svelte'
// UTILS
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
// ICONS
import PersonIcon from 'virtual:icons/proicons/person'
// TYPES
import type { AdminUserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

let { data, model }: { data: AdminUserProfile; model: UserContributionsModel } =
  $props()
const avatar = $derived(resolveAvatarImageSrc(data.profile.image))
const stats = $derived([
  {
    label: 'Published features',
    count: Object.values(data.profile.contributedFeatures).reduce(
      (sum, ids) => sum + ids.length,
      0,
    ),
  },
  {
    label: 'Published photos',
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
  class="mx-auto grid w-full max-w-7xl items-start gap-6 xl:grid-cols-[minmax(17rem,1fr)_minmax(0,2fr)]"
>
  <FormSurface class="min-w-0 rounded-xl border border-border p-6">
    <section aria-label="Profile details" class="space-y-6">
      <div class="flex items-center gap-4">
        <div
          class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted"
        >
          {#if avatar}
            <img
              src={avatar}
              alt=""
              class="size-full object-cover"
              referrerpolicy="no-referrer"
            >
          {:else}
            <PersonIcon class="size-10 text-muted-foreground" />
          {/if}
        </div>
        <div class="min-w-0">
          <h1 class="break-words text-xl font-semibold">
            {data.details?.name ||
              data.profile.attribution ||
              data.profile.displayUsername ||
              data.profile.username}
          </h1>
          <p class="break-all text-sm text-muted-foreground">
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
        <p class="text-sm text-muted-foreground">
          Contact and account details are restricted for your role.
        </p>
      {/if}
    </section>
  </FormSurface>
  <FormSurface class="min-w-0 overflow-hidden rounded-xl border border-border">
    <section aria-label="Contributions">
      <div class="space-y-4 border-b border-border p-6">
        <h2 class="text-lg font-semibold">Contributions</h2>
        <p class="text-sm text-muted-foreground">
          Published map contributions and related submissions visible in this hub.
        </p>
        <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {#each stats as stat (stat.label)}
            <div class="rounded-lg bg-muted/40 p-3">
              <dt class="text-xs text-muted-foreground">{stat.label}</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums">
                {stat.count.toLocaleString()}
              </dd>
            </div>
          {/each}
        </dl>
      </div>
      <ContributedFeatures userData={data.profile} {model} />
      <ContributedImages userData={data.profile} {model} />
    </section>
  </FormSurface>
</div>
