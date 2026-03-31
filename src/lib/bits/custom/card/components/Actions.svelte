<script lang="ts">
import type { Snippet } from 'svelte'
import type { CardActionsProps } from '../card.types'

type Props = CardActionsProps & {
  children?: Snippet
}

let {
  class: className = '',
  padding = 'none',
  bg = 'none',
  gap = 0,
  children,
}: Props = $props()

const actionStyle = $derived(`--bits-card-actions-gap: ${Math.max(0, gap)}px;`)
</script>

<aside
  class={['bits-card__actions', className].filter(Boolean).join(' ')}
  data-padding={padding}
  data-bg={bg}
  style={actionStyle}
>
  {@render children?.()}
</aside>
