<!-- biome-ignore-all lint/a11y/noNoninteractiveTabindex: The overflow region must support keyboard scrolling on narrow screens. -->
<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'
import type { HistoryLocaleGroup } from '#lib/revisions/historyLocaleGroups.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

let {
  rows,
  value,
}: {
  rows: HistoryLocaleGroup['rows']
  value: Snippet<[RevisionDifference, 'before' | 'after']>
} = $props()
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<section
  class="focus-visible:outline-primary w-full min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2"
  aria-label="Locale comparisons"
  tabindex="0"
>
  <table class="w-full min-w-[28rem] table-fixed border-collapse text-left text-sm">
    <colgroup>
      <col class="w-20">
      <col>
      <col>
    </colgroup>
    <thead class="text-muted-foreground text-xs">
      <tr>
        <th scope="col" class="border-border/40 border-b px-3 py-2 font-medium">
          Locale
        </th>
        <th scope="col" class="border-border/40 border-b p-3 font-medium">Before</th>
        <th scope="col" class="border-border/40 border-b p-3 font-medium">After</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr class="border-border/40 border-b last:border-b-0">
          <th
            scope="row"
            class="text-muted-foreground px-3 py-3 align-top text-xs font-medium break-words"
          >
            {row.locale}
          </th>
          <td
            class="text-muted-foreground min-w-0 p-3 align-top [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
          >
            {@render value(row.change, 'before')}
          </td>
          <td
            class="text-foreground min-w-0 p-3 align-top [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
          >
            {@render value(row.change, 'after')}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>
