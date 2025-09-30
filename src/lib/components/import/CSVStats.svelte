<script lang="ts">
// TYPES
type Stats = {
  valid: number;
  invalid: number;
  truncated: number;
};

type Props = {
  stats: Stats;
  totalColumns: number;
  showColumns?: boolean;
};

let { stats, totalColumns, showColumns = true }: Props = $props();
</script>

<!-- CSV Stats -->
<div class="mb-4 flex flex-wrap gap-2 text-sm">
  {#if showColumns}
    <div class="font-mono">
      <span class="text-success">{totalColumns}</span> COLS x
    </div>
  {/if}
  <div class="font-mono text-success">
    {stats.valid}
  </div>
  {#if stats.invalid > 0}
    <div class="badge badge-error">
      {stats.invalid} BAD (skipped)
    </div>
  {/if}
  {#if stats.truncated > 0}
    <div class="badge badge-warning">
      {stats.truncated} truncated
    </div>
  {/if}
  <div class="font-mono">ROWS</div>
</div>
