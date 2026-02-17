<script lang="ts">
import type { Snippet } from 'svelte'
import type { UserCardRootProps } from '../userCard.types'

type Props = UserCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<article class={`bits-form__user-card-root ${className}`}>
  {@render children?.()}
</article>
