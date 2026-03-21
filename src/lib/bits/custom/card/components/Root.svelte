<script lang="ts">
import type { Snippet } from 'svelte'
import GripVerticalIcon from 'virtual:icons/lucide/grip-vertical'
import type { CardRootProps } from '../card.types'

type Props = CardRootProps & { children?: Snippet }

let {
  class: className = '',
  size = 'md',
  isDraggable = false,
  reserveDragSpace = false,
  children,
}: Props = $props()
</script>

<article
  class={['bits-card', className].filter(Boolean).join(' ')}
  data-size={size}
  data-draggable={isDraggable}
  data-reserve-drag-space={reserveDragSpace}
>
  <span class="bits-card__drag-handle" aria-hidden="true">
    <GripVerticalIcon class="bits-card__drag-icon" />
  </span>
  {@render children?.()}
</article>
