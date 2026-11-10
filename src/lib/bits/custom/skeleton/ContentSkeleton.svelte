<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'

let {
  children,
  label = m.resource_loading(),
  class: className = '',
}: {
  children: Snippet
  label?: string
  class?: string
} = $props()
</script>

<!-- Render the owning layout so fonts, wrapping, breakpoints and spacing stay identical. -->
<div role="status" aria-busy="true" aria-label={label} class={className}>
  <div
    inert
    aria-hidden="true"
    class="[&_:is(h1,h2,h3,h4,p,dt,dd,input,textarea,button,svg)]:!bg-foreground/10 pointer-events-none select-none [&_*]:!text-transparent [&_*]:!shadow-none [&_*]:!text-shadow-none [&_:is(h1,h2,h3,h4,p,dt,dd,input,textarea,button,svg)]:!rounded [&_:is(h1,h2,h3,h4,p,dt,dd,input,textarea,button,svg)]:motion-safe:animate-pulse [&_img]:invisible [&_svg]:!fill-transparent [&_svg]:!stroke-transparent"
  >
    {@render children()}
  </div>
</div>
