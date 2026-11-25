<script lang="ts">
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import ResearchLocationCardsSkeleton from './ResearchLocationCardsSkeleton.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// ICONS
import LayersIcon from 'virtual:icons/proicons/layers'
import TagIcon from 'virtual:icons/proicons/tag'
import PropertiesIcon from 'virtual:icons/proicons/tag-multiple'
import TextIcon from 'virtual:icons/proicons/text'
import LocationIcon from 'virtual:icons/lucide/map-pin'

let { section = 'core' }: { section?: 'core' | 'fields' | 'locations' | 'all' } =
  $props()
</script>

<div role="status" aria-busy="true" aria-label="Loading session" class="min-w-0">
  <div aria-hidden="true">
    {#if section === 'locations'}
      <SectionHeader title="Locations for this session" icon={LocationIcon} />
      <div class="px-6 py-5">
        <ResearchLocationCardsSkeleton />
      </div>
    {:else}
      {#if section !== 'fields'}
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <section>
            <SectionHeader title="Session details" icon={LayersIcon} />
            <div class="space-y-4 px-6 py-5">
              <Skeleton class="h-3 w-20" /><Skeleton class="h-4 w-24" />
            </div>
          </section>
          <section>
            <SectionHeader title="Layers" icon={LayersIcon} />
            <div class="px-6 py-5">
              <div
                class="border-border bg-foreground/4 flex h-12 items-center justify-between rounded-lg border px-4"
              >
                <Skeleton class="h-4 w-32" /><Skeleton class="h-5 w-20" />
              </div>
            </div>
          </section>
        </div>
        <SectionHeader title="Feature fields" icon={TagIcon} />
        <div class="mx-6 flex min-w-0 flex-col gap-3 py-5">
          {#each Array(5) as _}
            <div
              class="border-border bg-foreground/4 flex min-h-14 items-center gap-4 rounded-lg border px-6"
            >
              <Skeleton class="h-4 w-28" /><Skeleton class="ml-auto h-4 w-24" />
              <Skeleton class="h-5 w-12" />
            </div>
          {/each}
        </div>
      {/if}
      {#if section === 'fields' || section === 'all'}
        <SectionHeader title="Project properties" icon={PropertiesIcon} />
        <div class="mx-6 flex flex-col gap-3 py-5">
          {#each Array(4) as _}
            <div
              class="border-border bg-foreground/4 flex min-h-14 items-center gap-4 rounded-lg border px-6"
            >
              <Skeleton class="h-4 w-32" /><Skeleton class="ml-auto h-4 w-24" />
              <Skeleton class="h-5 w-12" />
            </div>
          {/each}
        </div>
      {/if}
      {#if section !== 'fields'}
        <SectionHeader title="Title template" icon={TextIcon} />
        <div class="space-y-3 px-6 py-5">
          <Skeleton class="h-3 w-20" /><Skeleton class="h-20 w-full" />
          <Skeleton class="h-3 w-16" /><Skeleton class="h-4 w-40" />
        </div>
      {/if}
    {/if}
  </div>
</div>
