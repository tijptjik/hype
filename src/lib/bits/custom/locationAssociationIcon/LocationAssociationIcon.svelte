<script lang="ts">
// ICONS
import LinkIcon from 'virtual:icons/lucide/link'
import BrokenLinkIcon from 'virtual:icons/lucide/unlink'
// TYPES
import type { AddressAssociation } from '#lib/locations/association.js'
let {
  mode,
  class: className = 'size-4',
}: { mode: AddressAssociation['mode']; class?: string } = $props()
</script>

<span
  class={`inline-flex shrink-0 items-center justify-center ${mode === 'linked' ? 'text-primary' : 'text-foreground'} ${className}`}
  data-association-icon={mode}
  aria-hidden="true"
>
  {#if mode === 'manual'}
    <BrokenLinkIcon class="size-full" />
  {:else}
    <LinkIcon class="size-full" />
  {/if}
</span>
