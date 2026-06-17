<script lang="ts">
// TYPES
import type { MainRootProps } from './main.types'

let { children, class: className = '' }: MainRootProps = $props()
const rootClass = $derived(['p-6', className].filter(Boolean).join(' '))
</script>

<div class={rootClass}>
  {@render children?.()}
</div>
