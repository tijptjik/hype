<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { goto } from '$app/navigation'
// API
import { getMtrShopReview } from '#lib/api/mtrShopReview.remote.js'
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import LocationIdentityReviewSection from '#lib/bits/patterns/forms/featureLocation/LocationIdentityReviewSection.svelte'

const station = $derived(page.url.searchParams.get('station') || 'KOT')
const request = $derived(getMtrShopReview({ station, meta: { isAdminRequest: true } }))
const selected = $derived(page.url.searchParams.get('location'))
const reviewId = $derived(page.url.searchParams.get('review'))
</script>

<svelte:head><title>MTR shop review</title></svelte:head>
<main class="h-full overflow-auto p-6">
  <h1 class="mb-4 text-xl font-semibold">MTR shop review</h1>
  {#await request}
    <div role="status" aria-label="Loading shops" class="space-y-4">
      <Skeleton class="h-10 w-64" />
      {#each Array(6) as _}
        <Skeleton class="h-24 w-full" />
      {/each}
    </div>
  {:then result}
    <label class="mb-6 block"
      >Station
      <select
        class="border-border ml-3 rounded border p-2"
        value={station}
        onchange={event =>
          goto(`/admin/mtr-shops?station=${event.currentTarget.value}`)}
      >
        {#each result.stations as option}
          <option value={option.code}>{option.name} ({option.count})</option>
        {/each}
      </select>
    </label>
    <div class="grid gap-8 lg:grid-cols-2">
      <div>
        {#each result.shops as shop (shop.id)}
          <article class="border-border border-b py-4">
            <h2 class="font-medium">{shop.code} · {shop.name}</h2>
            <p class="mt-1 text-sm">
              Brand:
              {shop.brand?.code ||
                (shop.brandDisposition === 'service'
                  ? 'Classified as a service in catalogue review'
                  : shop.brandDisposition === 'skip'
                    ? 'Excluded in catalogue review'
                    : 'Needs review')}
            </p>
            <p class="mt-1 text-sm">
              Occupancy:
              {shop.occupancies.map(o => o.state).join(', ') || 'Polygon needs review'}
            </p>
            <div class="mt-3 flex flex-wrap gap-4 text-sm">
              <a class="underline" href={`/admin/locations/${shop.id}`}
                >Open establishment</a
              >
              <a
                class="underline"
                href={`/admin/locations/${shop.id}?edit=true#relationships`}
                >Record or edit past occupancy</a
              >
            </div>
            {#if shop.ssId}
              <p class="mt-2 text-sm">Linked: {shop.ssId}</p>
            {/if}
            {#each shop.reviews as review}
              <a
                class="mt-3 block underline"
                href={`/admin/mtr-shops?station=${station}&location=${shop.id}&review=${review.id}`}
                >Review {review.name}</a
              >
              {#if review.candidateLocationId}
                <a
                  class="mt-2 block text-sm underline"
                  href={`/admin/locations/${review.candidateLocationId}?edit=true#relationships`}
                >
                  Record {review.name} as a past occupant
                </a>
              {/if}
            {/each}
          </article>
        {/each}
      </div>
      <section aria-label="Upstream identity review">
        {#if selected &&
          reviewId &&
          result.shops.some(
            shop =>
              shop.id === selected &&
              shop.reviews.some(review => review.id === reviewId),
          )}
          {#key reviewId}
            <LocationIdentityReviewSection
              featureId=""
              locationId={selected}
              initialReviewId={reviewId}
              isDirty={false}
              onCommitted={async () => {
                await request.refresh()
              }}
            />
          {/key}
        {:else}
          <p>
            Select an upstream candidate to compare identities. A matching shop code can
            also identify a previous occupant; use the occupancy editor to retain that
            history.
          </p>
        {/if}
      </section>
    </div>
  {:catch failure}
    <p role="alert">
      {failure?.message === 'INSUFFICIENT_ROLE' ||
      failure?.message === 'UNAUTHENTICATED'
        ? 'Your session could not be authorized for this review. Refresh your session and try again.'
        : 'Could not load the MTR shop review. Please retry.'}
    </p>
    <button type="button" class="mt-3 underline" onclick={() => request.refresh()}>
      Retry
    </button>
  {/await}
</main>
