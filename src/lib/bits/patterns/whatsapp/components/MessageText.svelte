<script lang="ts">
import type { Snippet } from 'svelte'
let { text, trailing }: { text: string; trailing?: Snippet } = $props()
const lines = $derived.by(() => {
  let offset = 0
  return text.split('\n').map(line => {
    const quoted = line.startsWith('> '),
      content = quoted ? line.slice(2) : line
    const result = { text: content, quoted, offset: offset + (quoted ? 2 : 0) }
    offset += line.length + 1
    return result
  })
})
</script>

<div
  class="max-w-full min-w-0 space-y-1 [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
>
  {#each lines as line, index}
    {#if line.quoted}
      <blockquote
        class="border-primary text-muted-foreground flow-root border-l-2 pl-3"
      >
        <span data-quote-offset={line.offset} data-quote-length={line.text.length}
          >{line.text || ' '}</span
        >
        {#if index === lines.length - 1 && trailing}
          <span
            class="float-right ml-2 inline-flex min-h-[1lh] items-end whitespace-normal select-none"
            >{@render trailing()}</span
          >
        {/if}
      </blockquote>
    {:else}
      <p class="flow-root">
        <span data-quote-offset={line.offset} data-quote-length={line.text.length}
          >{line.text || ' '}</span
        >
        {#if index === lines.length - 1 && trailing}
          <span
            class="float-right ml-2 inline-flex min-h-[1lh] items-end whitespace-normal select-none"
            >{@render trailing()}</span
          >
        {/if}
      </p>
    {/if}
  {/each}
</div>
