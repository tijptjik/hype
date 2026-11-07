<script lang="ts">
// COMPONENTS
import FeatureCardBreadcrumbTrail from '#lib/bits/patterns/cards/featureCard/components/FeatureCardBreadcrumbTrail.svelte'
let feature = $state(0)
</script>

<div class="bg-base-200 text-base-content p-4">
  <div class="flex w-full max-w-[240px] items-start" data-breadcrumb-row>
    {#key feature}
      <FeatureCardBreadcrumbTrail
        organisationName="Cultural & Media Education Foundation"
        projectName="Old and Valuable Trees"
        layerName="Registered Trees in Sham Shui Po"
      />
    {/key}
    <button type="button" class="h-11 w-11 shrink-0" aria-label="Menu">☰</button>
  </div>
  <p>Feature title</p>
  <button type="button" onclick={() => (feature += 1)}>Next feature</button>
</div>
