<script lang="ts">
// TYPES
import type { PropertyDisplay } from '#lib/properties/value.js'
let { display, value = '' }: { display?: PropertyDisplay; value?: string } = $props()
</script>

{#if display?.kind === 'links'}
  <div
    class={[
      'flex max-h-[88px] overflow-y-auto overscroll-contain',
      display.numbered ? 'flex-wrap gap-x-2' : 'flex-col',
    ]}
  >
    {#each display.links as link, index (link.id)}
      <a
        class="block min-h-11 min-w-0 break-words px-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={display.numbered
          ? `Reference ${index + 1}: ${link.label}`
          : link.label}
        onclick={event => event.stopPropagation()}
      >
        {display.numbered ? index + 1 : link.label}<span
          class="ml-1 inline-block"
          aria-hidden="true"
          >↗</span
        >
      </a>
    {/each}
  </div>
{:else if display?.kind === 'phones'}
  {#each display.numbers as number, index}
    {#if index > 0}
      <span>, </span>
    {/if}
    <a
      href={number.href}
      class="inline-block whitespace-nowrap tabular-nums underline decoration-current/40 underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2"
      onclick={event => event.stopPropagation()}
      >{number.text}</a
    >
  {/each}
{:else}
  {display?.kind === 'unavailable' ? display.text : value}
{/if}
