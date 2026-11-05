<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'

let {
  visible,
  reserveSpace = false,
  children,
  class: className = '',
}: {
  visible: boolean
  reserveSpace?: boolean
  children: Snippet
  class?: string
} = $props()
</script>

<!-- Keep controls mounted through mode changes; hidden actions cannot receive focus. -->
<div
  inert={!visible}
  aria-hidden={!visible}
  class={`grid min-w-0 shrink-0 items-center transition-[grid-template-columns,opacity] duration-180 ease-in-out motion-reduce:transition-none ${className}`}
  style:grid-template-columns={visible || reserveSpace ? '1fr' : '0fr'}
  style:opacity={visible ? 1 : 0}
>
  <div class={reserveSpace ? 'min-w-0' : 'min-w-0 overflow-hidden'}>
    <div class="flex w-max items-center whitespace-nowrap">{@render children()}</div>
  </div>
</div>
