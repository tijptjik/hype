<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/patterns/cardPrimitives'
import type { UserCardWrapperProps } from '../userCard.types'

type Props = UserCardWrapperProps & { children?: Snippet }

let { class: className = '', isAnimated = false, children }: Props = $props()
</script>

<Card.Wrapper class={`bits-form__user-card-wrapper ${className}`} {isAnimated}>
  {@render children?.()}
</Card.Wrapper>
