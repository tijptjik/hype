<script lang="ts">
// BITS
import * as Card from '#lib/bits/custom/analyticsCard/components/index.js'
// DOMAIN
import { USAGE_LABELS } from '#lib/analytics/productUsage.js'
// TYPES
import type { ProductAnalyticsResult } from '#lib/api/services/productAnalytics.js'

let { state }: { state: ProductAnalyticsResult | null } = $props()
</script>

<Card.Root class="space-y-5">
  <div>
    <h2 class="text-lg font-semibold">Product usage · last 30 days</h2>
    <p class="text-foreground-alt text-sm">
      Interaction and contribution estimates, adjusted for sampling. These are event
      counts, not unique people.
    </p>
  </div>
  {#if !state}
    <p role="status">Loading product usage…</p>
  {:else if state.status !== 'success'}
    <p role="status" class="text-foreground-alt text-sm">{state.message}</p>
  {:else}
    <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {#each Object.entries(USAGE_LABELS) as [event, label]}
        <div class="border-foreground/10 rounded-lg border p-4">
          <dt class="text-foreground-alt text-sm">{label}</dt>
          <dd class="mt-2 text-2xl font-semibold tabular-nums">
            {(
              state.totals.find(row => row.event === event)?.count ?? 0
            ).toLocaleString()}
          </dd>
        </div>
      {/each}
    </dl>
    <p class="text-foreground-alt text-xs">
      Layer activations include initial defaults and restored selections. Edits count
      successful feature-form saves. Drafts and reviews do not count as new
      contributions.
    </p>
    {#if state.rankings.length}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="pb-3 text-left font-semibold">
            Top 100 event/resource combinations
          </caption>
          <thead>
            <tr class="border-foreground/10 border-b">
              <th class="p-2">Event</th>
              <th class="p-2">Resource or contribution ID</th>
              <th class="p-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {#each state.rankings as row}
              <tr class="border-foreground/10 border-b">
                <td class="p-2">{USAGE_LABELS[row.event]}</td>
                <td class="p-2 font-mono text-xs break-all">{row.entityId}</td>
                <td class="p-2 text-right tabular-nums">
                  {row.count.toLocaleString()}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="text-foreground-alt text-sm">No product events in this window yet.</p>
    {/if}
  {/if}
</Card.Root>
