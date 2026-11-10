<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { cx } from '#lib/bits/utils.js'

let {
  label = m.resource_loading(),
  rows = 1,
  text,
  class: className = '',
}: {
  label?: string
  rows?: number
  /** Known eventual text reserves its exact font metrics and wrapping. */
  text?: string
  class?: string
} = $props()
</script>

<span
  role="status"
  aria-busy="true"
  aria-label={label}
  class={cx(
    text
      ? 'relative inline-grid align-baseline'
      : 'inline-flex w-full flex-col align-middle',
    className,
  )}
>
  {#if text !== undefined}
    <span aria-hidden="true" class="invisible col-start-1 row-start-1">{text}</span>
    <span
      aria-hidden="true"
      class="bg-foreground/10 col-start-1 row-start-1 my-[0.2lh] rounded motion-safe:animate-pulse motion-reduce:animate-none"
    ></span>
  {:else}
    {#each Array.from({ length: rows }) as _, index (index)}
      <span
        aria-hidden="true"
        class={cx(
          'my-[0.2lh] block h-[0.6lh] max-w-full rounded bg-foreground/10 motion-safe:animate-pulse motion-reduce:animate-none',
          index % 2 ? 'w-2/3' : 'w-full',
        )}
      ></span>
    {/each}
  {/if}
</span>
