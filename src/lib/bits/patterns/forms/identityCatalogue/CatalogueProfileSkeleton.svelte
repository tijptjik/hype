<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
// ICONS
import Tags from 'virtual:icons/lucide/tags'
import ListTree from 'virtual:icons/lucide/list-tree'
import Building from 'virtual:icons/lucide/building-2'
import Languages from 'virtual:icons/lucide/languages'
// TYPES
let { kind }: { kind: 'brand' | 'group' } = $props()
</script>

<section
  role="status"
  aria-label="Loading catalogue details"
  aria-busy="true"
  class="border-border mx-auto my-6 max-w-4xl overflow-hidden rounded-xl border"
  data-catalogue-skeleton
>
  <span class="sr-only">Loading catalogue details</span>
  <div aria-hidden="true">
    <div class="grid grid-cols-[12rem_minmax(0,1fr)]">
      <SectionHeader title={kind === 'group' ? 'Group' : 'Brand'} icon={Tags} />
      <SectionHeader title="Names" icon={Languages} />
      <div class="px-6 py-4"><Skeleton class="size-28 rounded-xl" /></div>
      <div class="grid content-start gap-3 px-6 py-7">
        <Skeleton class="h-4 w-40 max-w-full" />
      </div>
    </div>
    <SectionHeader title="Identity" icon={ListTree} />
    <div class="grid grid-cols-2 items-start gap-x-8 gap-y-6 px-6 py-5">
      <div class="grid gap-5">
        <span class="text-muted-foreground text-xs font-medium">Code</span>
        <Skeleton class="mx-4 h-4 w-24" />
      </div>
      <div class="grid gap-3">
        <span class="text-muted-foreground text-xs font-medium"
          >{kind === 'group' ? 'Parent group' : 'Group'}</span
        >
        <div class="flex items-center gap-3 px-4">
          <Skeleton class="size-12 shrink-0 rounded-lg" />
          <Skeleton class="h-4 w-32 max-w-full" />
        </div>
      </div>
      {#if kind === 'brand'}
        <div class="grid gap-5">
          <span class="text-muted-foreground text-xs font-medium">Categories</span>
          <Skeleton class="mx-4 h-7 w-20 rounded-full" />
        </div>
        <div class="grid gap-5">
          <span class="text-muted-foreground text-xs font-medium">Wikidata</span>
          <Skeleton class="mx-4 h-4 w-28" />
        </div>
      {/if}
    </div>
    {#if kind === 'group'}
      <SectionHeader title="Subgroups" icon={Building} />
      <div class="px-6 py-5">
        <Skeleton class="mx-2 size-20 rounded-xl" /><Skeleton class="mt-3 h-4 w-28" />
      </div>
    {/if}
    <SectionHeader title={kind === 'group' ? 'Brands' : 'Sibling brands'} icon={Tags} />
    <div class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-6 px-6 py-5">
      {#each [0, 1, 2] as item (item)}
        <div class="grid justify-items-center gap-3 p-2">
          <Skeleton class="size-20 rounded-xl" /><Skeleton class="h-4 w-20" />
        </div>
      {/each}
    </div>
  </div>
</section>
