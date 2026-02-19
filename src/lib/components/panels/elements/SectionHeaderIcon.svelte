<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte'
import type { IconSource } from '@steeze-ui/svelte-icon'

let {
  icon,
  iconColorClass,
  onNavigate,
  isNarrow,
  href,
}: {
  icon: string | IconSource
  iconColorClass: string
  onNavigate?: (e: MouseEvent) => void
  isNarrow: boolean
  href: string
} = $props()
</script>

<a
  class="focus:outline-none focus:ring-0 {isNarrow ? 'px-2 py-2' : ''}"
  href={isNarrow ? href : null}
  onclick={isNarrow ? onNavigate : undefined}
>
  {#if typeof icon === 'string'}
    <img src={icon} alt="" class="h-12 text-base-content/60" aria-hidden="true">
  {:else}
    <Icon src={icon} class="h-12 w-8 {iconColorClass}" aria-hidden="true" />
  {/if}
</a>
