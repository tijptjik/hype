<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// THIRD-PARTY
import DOMPurify from 'dompurify'
// BITS
import { cx } from '#lib/bits/utils.js'

let {
  html = '',
  label,
  class: className = '',
}: { html?: string; label?: string; class?: string } = $props()

let mounted = $state(false)
onMount(() => {
  mounted = true
})

// Sanitize in the browser; SSR and hydration initially render escaped source text.
const safeHtml = $derived(
  mounted
    ? DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
        FORBID_ATTR: ['style', 'id', 'name'],
      })
    : '',
)
</script>

<section
  aria-label={label}
  class={cx(
    'min-w-0 whitespace-pre-line break-words text-[15px] leading-[22px] [overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:whitespace-normal [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap',
    className,
  )}
>
  {#if mounted}
    {@html safeHtml}
  {:else}
    {html}
  {/if}
</section>
