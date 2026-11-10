<script lang="ts">
// COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import FormFieldSkeleton from '../formSkeleton/components/FormFieldSkeleton.svelte'
let { full = false }: { full?: boolean } = $props()
</script>
<div
  class={full
    ? '@container flex h-full min-h-0 flex-col overflow-hidden'
    : 'w-full min-w-0'}
  role="status"
  aria-busy="true"
  aria-label="Loading address"
>
  <SectionHeader title="Location" />
  <div
    class={full
      ? 'grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-6 @min-[900px]:grid-cols-[15rem_minmax(0,1fr)]'
      : 'grid gap-6 py-6'}
  >
    {#if full}
      <ContentSkeleton
        ><div class="space-y-6">
          {#each ['Locality', 'District', 'Region'] as label}
            <div class="space-y-2 py-3">
              <h3 class="text-xs">{label}</h3>
              <p class="text-sm">Location name</p>
            </div>
          {/each}
        </div></ContentSkeleton
      >
    {/if}
    <div
      class={full
        ? 'min-w-0 space-y-6 @min-[900px]:border-l @min-[900px]:pl-6'
        : 'min-w-0 space-y-6'}
    >
      <FormFieldSkeleton label="Name" />
      <FormFieldSkeleton label="Building" />
      <div class="grid grid-cols-2 gap-6">
        <FormFieldSkeleton label="Number" /><FormFieldSkeleton label="Street" />
      </div>
      <FormFieldSkeleton label="Additional address" multiline />
    </div>
  </div>
</div>
