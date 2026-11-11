<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import HistoryCategories from './HistoryCategories.svelte'
// PRESENTATION
import { historyStyles as styles } from './organisationHistory.styles'
let {
  heading = true,
  feature = false,
  showFields = true,
  expanded = true,
  count = 3,
}: {
  heading?: boolean
  feature?: boolean
  showFields?: boolean
  expanded?: boolean
  count?: number
} = $props()
</script>

<div
  class="@container w-full min-w-0"
  role="status"
  aria-busy="true"
  aria-label="Loading history"
>
  <!-- Category names are already known before the deferred module or records arrive. -->
  {#if heading}
    <HistoryCategories {showFields} pending />
  {/if}
  <ol class="px-3 py-5 @[36rem]:px-5" aria-hidden="true">
    {#each Array(count) as _, index (index)}
      <li class="relative min-w-0 pb-5 pl-5 last:pb-0 @[36rem]:pl-7">
        <span
          class="border-primary/25 absolute top-6 bottom-0 left-[3.5px] border-l"
        ></span>
        <span
          class="bg-primary/30 absolute top-6 left-0 size-[9px] rounded-full"
        ></span>
        <article class={styles.entry}>
          <header class={feature ? styles.featureSummary : styles.resourceSummary}>
            <div class="col-span-full min-w-0 @[64rem]:col-span-1">
              <div class="mb-1 flex h-4 items-center gap-2">
                <Skeleton class="h-3 w-12" /><Skeleton class="h-3 w-9" />
              </div>
              <div class="flex h-[1lh] items-center text-sm leading-relaxed">
                <Skeleton class="h-3.5 w-56 max-w-full" />
              </div>
            </div>
            {#each feature
              ? ['w-24', 'w-32', 'w-16']
              : ['w-32', 'w-24', 'w-32', 'w-12'] as width}
              <div class="min-w-0 space-y-1">
                <div class="flex h-4 items-center"><Skeleton class="h-2.5 w-10" /></div>
                <div class="flex h-5 items-center">
                  <Skeleton class={`h-3.5 max-w-full ${width}`} />
                </div>
              </div>
            {/each}
            <div
              class="col-span-full ml-auto flex h-9 items-center gap-2 px-2 @[64rem]:col-span-1"
            >
              <Skeleton class="h-3 w-24" /><Skeleton class="size-3" />
            </div>
          </header>
          <!-- The latest revision opens by default; reserve a comparison, not only its summary. -->
          {#if index === 0 && !feature && expanded}
            <div class="border-border/50 bg-muted/10 grid min-w-0 gap-5 border-t p-4">
              <section class={styles.group}>
                <div class="flex h-5 items-center gap-2">
                  <span class="bg-primary/30 h-3 w-0.5 rounded-full"></span>
                  <Skeleton class="h-3 w-24" />
                </div>
                {#each [0, 1] as field}
                  <section class={styles.comparison}>
                    <div class={styles.fieldHeading}>
                      {#each [0, 1] as cell}
                        <div class="space-y-2">
                          <Skeleton class="h-3 w-10" />
                          <Skeleton class={cell ? 'h-4 w-16' : 'h-4 w-28 max-w-full'} />
                        </div>
                      {/each}
                    </div>
                    <div class={styles.values}>
                      {#each [0, 1] as cell}
                        <div class={cell ? styles.after : styles.before}>
                          <Skeleton class="h-3 w-12" />
                          <Skeleton
                            class={field
                              ? 'h-4 w-48 max-w-full'
                              : 'h-4 w-20 max-w-full'}
                          />
                        </div>
                      {/each}
                    </div>
                  </section>
                {/each}
              </section>
            </div>
          {/if}
        </article>
      </li>
    {/each}
  </ol>
</div>
