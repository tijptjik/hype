<script lang="ts">
// COMPONENTS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import FormFieldSkeleton from '#lib/bits/patterns/forms/formSkeleton/components/FormFieldSkeleton.svelte'
</script>
<div
  role="status"
  aria-label="Loading profile"
  aria-busy="true"
  class="h-full w-full min-w-0"
>
  <VisualSection
    expandedHeight={208}
    minimumHeight={160}
    showImage={false}
    showControls={false}
  >
    {#snippet map()}
      <div class="flex h-full w-full gap-px">
        <Skeleton class="h-full w-44 shrink-0 rounded-none sm:w-52" />
        <Skeleton class="h-full flex-1 rounded-none" />
      </div>
    {/snippet}
  </VisualSection>
  <div class="grid grid-cols-1 xl:grid-cols-3">
    {#each [
      { title: 'Names', fields: ['Name', 'Username'] },
      { title: 'Phone', fields: ['Telephone'] },
      { title: 'Web', fields: ['Email', 'Attribution'] },
    ] as section}
      <section class="min-w-0">
        <SectionHeader title={section.title} />
        <div class="space-y-4 px-6 py-6">
          {#each section.fields as label}
            <FormFieldSkeleton {label} />
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>
