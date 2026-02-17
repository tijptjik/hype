<script lang="ts">
import type { UserCardAvatarProps } from '../userCard.types'

let { name = null, image = null, class: className = '' }: UserCardAvatarProps = $props()
let imageFailed = $state(false)

function getInitial(value?: string | null): string {
  return value?.trim()?.charAt(0)?.toUpperCase() || '?'
}
</script>

<figure class={`bits-form__user-card-avatar ${className}`}>
  {#if image && !imageFailed}
    <img
      src={image}
      alt={name || 'User avatar'}
      class="bits-form__user-card-avatar-image"
      loading="lazy"
      onerror={() => {
        imageFailed = true
      }}
    >
  {:else}
    <div class="bits-form__user-card-avatar-fallback">{getInitial(name)}</div>
  {/if}
</figure>
