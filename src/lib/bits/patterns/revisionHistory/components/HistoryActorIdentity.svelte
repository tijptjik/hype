<script lang="ts">
// BITS COMPONENTS
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'

let {
  username,
  label,
  tooltip,
  image,
  avatarName = '',
  showAvatar = false,
  class: className = '',
}: {
  username?: string | null
  label: string
  tooltip?: string
  image?: string | null
  avatarName?: string
  showAvatar?: boolean
  class?: string
} = $props()
</script>

{#snippet identity()}
  {#if showAvatar}
    <span aria-hidden="true"
      ><Avatar name={avatarName} src={image} class="size-5!" /></span
    >
  {/if}
  <span class="min-w-0 [overflow-wrap:anywhere] whitespace-normal">{label}</span>
{/snippet}

{#if username}
  <a
    href={`/admin/users/${encodeURIComponent(username)}`}
    class="{className} hover:text-primary focus-visible:outline-primary inline-flex max-w-full min-w-0 items-center gap-2 rounded-sm hover:underline focus-visible:outline-2"
    data-tooltip={tooltip}
    onclick={event => event.stopPropagation()}
    >{@render identity()}</a
  >
{:else}
  <span
    class="{className} inline-flex max-w-full min-w-0 items-center gap-2"
    data-tooltip={tooltip}
    >{@render identity()}</span
  >
{/if}
