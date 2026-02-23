<script lang="ts">
import type { Snippet } from 'svelte'
import type { CardRootProps } from '../cardPrimitives.types'

type Props = CardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<article class={className}>{@render children?.()}</article>
