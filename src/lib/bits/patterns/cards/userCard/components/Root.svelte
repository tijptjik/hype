<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '#lib/bits/custom/index.js'
import type { UserCardRootProps } from '../userCard.types'

type Props = UserCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<Card.Root size="md" class={`bits-form__user-card-root ${className}`}>
  {@render children?.()}
</Card.Root>
