<script lang="ts">
import type { MainRootProps } from './main.types'

let { children, class: className = '' }: MainRootProps = $props()
const rootClass = $derived(['bits-main', className].filter(Boolean).join(' '))
</script>

<main class={rootClass}>{@render children?.()}</main>
