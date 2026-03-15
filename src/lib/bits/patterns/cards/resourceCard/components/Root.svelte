<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'
import type { ResourceCardRootProps } from '../resourceCard.types'

type Props = ResourceCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<Card.Root class={`bits-form__parent-resource-item ${className}`}>
  {@render children?.()}
</Card.Root>
