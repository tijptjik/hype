<script lang="ts">
let { text }: { text: string } = $props()
const lines = $derived.by(() => {
  let offset = 0
  return text.split('\n').map(line => {
    const quoted = line.startsWith('> '), content = quoted ? line.slice(2) : line
    const result = { text: content, quoted, offset: offset + (quoted ? 2 : 0) }
    offset += line.length + 1
    return result
  })
})
</script>

<div class="space-y-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
  {#each lines as line}
    {#if line.quoted}<blockquote data-quote-offset={line.offset} data-quote-length={line.text.length} class="border-l-2 border-primary pl-3 text-muted-foreground">{line.text || ' '}</blockquote>
    {:else}<p data-quote-offset={line.offset} data-quote-length={line.text.length}>{line.text || ' '}</p>{/if}
  {/each}
</div>
