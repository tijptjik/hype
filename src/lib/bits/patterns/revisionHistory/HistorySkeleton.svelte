<script lang="ts">
// COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import { historyStyles as styles } from './organisationHistory.styles'
let {
  heading = true,
  feature = false,
  count = 3,
}: { heading?: boolean; feature?: boolean; count?: number } = $props()
</script>

<ContentSkeleton label="Loading history" class="@container w-full min-w-0">
  {#if heading}
    <SectionHeader title="History" description="Changes · newest first" />
    <div class="border-border/50 bg-primary/3 flex min-h-12 gap-4 border-y px-5">
      <button type="button" class={styles.tab}>Profile and settings</button
      ><button type="button" class={styles.tab}>Field definitions</button>
    </div>
  {/if}
  <ol class="px-3 py-5 @[36rem]:px-5">
    {#each Array(count) as _, index (index)}
      <li class="relative min-w-0 pb-5 pl-5 last:pb-0 @[36rem]:pl-7">
        <article class={styles.entry}>
          <header class={feature ? styles.featureSummary : styles.resourceSummary}>
            <div class="col-span-full min-w-0 @[64rem]:col-span-1">
              <p class="mb-1 text-xs">Revision</p>
              <h3 class="text-sm leading-relaxed font-medium">
                Profile and settings updated
              </h3>
            </div>
            {#each ['Field', 'Date', 'Author', 'Source'] as label}
              <div class="min-w-0 space-y-1">
                <dt class={styles.label}>{label}</dt>
                <dd class="text-sm">Pending value</dd>
              </div>
            {/each}
            <button type="button" class={styles.disclosure}>Changed fields</button>
          </header>
        </article>
      </li>
    {/each}
  </ol>
</ContentSkeleton>
