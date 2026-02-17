<script lang="ts">
import type { Snippet } from 'svelte'
import type { UserCardWrapperProps } from '../userCard.types'

type Props = UserCardWrapperProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<div class={`bits-form__user-card-wrapper ${className}`}>{@render children?.()}</div>
