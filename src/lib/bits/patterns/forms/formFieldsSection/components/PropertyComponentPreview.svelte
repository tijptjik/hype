<script lang="ts">
let { component }: { component: string } = $props()
</script>

<!-- Percentage coordinates let the examples fill the available width without stretching icons. -->
<svg
  class="h-7 w-full min-w-0 text-secondary dark:brightness-150 dark:[&_line]:opacity-90 dark:[&_rect]:opacity-90 [&_line]:text-primary [&_path]:text-accent [&_circle]:text-accent"
  fill="none"
  stroke="currentColor"
  stroke-width="1.25"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if component === 'RangeField'}
    <line x1="4%" y1="14" x2="96%" y2="14" opacity=".25" />
    <line x1="25%" y1="14" x2="75%" y2="14" stroke-width="3" opacity=".7" />
    <circle cx="25%" cy="14" r="3" fill="currentColor" />
    <circle cx="75%" cy="14" r="3" fill="currentColor" />
  {:else if component === 'ToggleField'}
    <line x1="5%" y1="14" x2="53%" y2="14" opacity=".45" />
    <svg aria-hidden="true" x="65%" y="5" width="34" height="18" viewBox="0 0 34 18">
      <rect x="1" y="1" width="32" height="16" rx="8" opacity=".6" />
      <circle cx="25" cy="9" r="5" fill="currentColor" stroke="none" />
    </svg>
  {:else if component === 'DateRangeField' || component === 'TimeRangeField'}
    {#each ['4%', '76%'] as x, index}
      <svg aria-hidden="true" {x} y="2" width="24" height="24" viewBox="0 0 24 24">
        {#if component === 'DateRangeField'}
          <rect x="2" y="4" width="20" height="18" rx="3" opacity=".6" />
          <path d="M2 10h20M7 2v5m10-5v5M7 14h3m4 0h3m-10 4h3" />
        {:else}
          <circle cx="12" cy="12" r="10" opacity=".6" />
          <path d={index === 0 ? 'M12 5v7l5 3' : 'M12 5v7h6'} />
        {/if}
      </svg>
    {/each}
    <line x1="34%" y1="14" x2="64%" y2="14" opacity=".4" />
    <svg aria-hidden="true" x="60%" y="10" width="6" height="8">
      <path d="m1 1 3 3-3 3" opacity=".5" />
    </svg>
  {:else if component === 'LinkField'}
    <svg aria-hidden="true" x="2%" y="3" width="24" height="24" viewBox="0 0 24 24">
      <path d="m9 15 6-6m-7 3-3 3a4 4 0 0 0 6 6l4-4m-6-10 4-4a4 4 0 0 1 6 6l-3 3" />
    </svg>
    <line x1="28%" y1="11" x2="96%" y2="11" opacity=".6" />
    <line x1="28%" y1="17" x2="80%" y2="17" opacity=".6" />
    <line x1="28%" y1="21" x2="80%" y2="21" opacity=".3" />
  {:else}
    <rect x="1%" y="2" width="98%" height="24" rx="4" opacity=".45" />
    {#if component === 'TextareaField'}
      <line x1="8%" y1="8" x2="86%" y2="8" opacity=".5" />
      <line x1="8%" y1="14" x2="74%" y2="14" opacity=".5" />
      <line x1="8%" y1="20" x2="53%" y2="20" opacity=".5" />
    {:else if component === 'PhoneField'}
      <svg aria-hidden="true" x="6%" y="9" width="10" height="10">
        <path d="M5 1v8M1 5h8" />
      </svg>
      <line x1="22%" y1="3" x2="22%" y2="25" opacity=".35" />
      <line x1="30%" y1="14" x2="88%" y2="14" opacity=".5" />
    {:else}
      <line x1="8%" y1="14" x2="66%" y2="14" opacity=".5" />
      <svg aria-hidden="true" x="82%" y="8" width="10" height="12">
        {#if component === 'SelectField'}
          <path d="m1 4 4 4 4-4" />
        {:else}
          <path d="M5 1v10M2 1h6m-6 10h6" />
        {/if}
      </svg>
    {/if}
  {/if}
</svg>
