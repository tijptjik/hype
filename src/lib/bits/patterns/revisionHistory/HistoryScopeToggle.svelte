<script lang="ts">
let {
  includeDescendants = false,
  onSelect,
}: {
  includeDescendants?: boolean
  onSelect?: (includeDescendants: boolean) => void
} = $props()
</script>

<fieldset
  aria-label="History scope"
  class="border-base-content/15 ml-1 flex shrink-0 items-center rounded-lg border p-0.5"
>
  {#each [false, true] as descendants}
    {@const label = descendants
      ? 'This resource and all descendants'
      : 'This resource only'}
    <button
      type="button"
      aria-label={label}
      aria-pressed={includeDescendants === descendants}
      data-tooltip={label}
      class="text-base-content/60 hover:bg-base-content/5 focus-visible:outline-focus aria-pressed:bg-base-content/8 aria-pressed:text-base-content flex size-9 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
      onclick={() => onSelect?.(descendants)}
    >
      <svg viewBox="0 0 24 24" class="size-5" fill="none" aria-hidden="true">
        <!-- The same filled root anchors both scopes; branches add descendants. -->
        <circle cx="12" cy="6" r="3" fill="currentColor" />
        {#if descendants}
          <path
            d="M12 9v4M4 17v-4h16v4M12 13v4"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="4" cy="19" r="2" fill="currentColor" />
          <circle cx="12" cy="19" r="2" fill="currentColor" />
          <circle cx="20" cy="19" r="2" fill="currentColor" />
        {/if}
      </svg>
    </button>
  {/each}
</fieldset>
