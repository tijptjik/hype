<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import LocationRematchStatus from '#lib/bits/patterns/forms/featureLocation/LocationRematchStatus.svelte'
import LocationIdentityReviewSection from '#lib/bits/patterns/forms/featureLocation/LocationIdentityReviewSection.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'

setResponsiveCtx()
let phase = $state(sessionStorage.getItem('rematch-fixture-phase') ?? 'failed')
async function committed(): Promise<void> {
  phase = sessionStorage.getItem('rematch-fixture-phase') ?? 'failed'
}
</script>

<main
  class="bits-theme bg-panel text-foreground mx-auto min-h-screen max-w-3xl"
  data-rematch-fixture={phase}
>
  <FormSurface>
    {#if phase === 'failed'}
      <LocationRematchStatus
        locationId="fixture-location"
        jobId="fixture-job"
        status="failed"
        reason="PROVIDER_OR_STORAGE_FAILED"
        onCommitted={committed}
      />
    {:else}
      <LocationIdentityReviewSection
        featureId="fixture-feature"
        locationId="fixture-location"
        initialReviewId="fixture-review"
        isDirty={false}
        onCommitted={committed}
      />
    {/if}
    {#if phase === 'applied'}
      <output class="block p-4"
        >Fixture saved. Independent Feature values retained.</output
      >
    {/if}
  </FormSurface>
</main>
