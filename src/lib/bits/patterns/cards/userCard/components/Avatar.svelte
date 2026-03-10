<script lang="ts">
import { Card } from '$lib/bits/custom'
import type { UserCardAvatarProps } from '../userCard.types'

let { name = null, image = null, class: className = '' }: UserCardAvatarProps = $props()
</script>

<Card.Avatar
  {name}
  {image}
  class={`bits-form__user-card-avatar ${className}`}
  imageClass="bits-form__user-card-avatar-image"
  fallbackClass="bits-form__user-card-avatar-fallback"
/>
