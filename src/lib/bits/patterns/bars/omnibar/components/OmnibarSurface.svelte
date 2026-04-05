<script lang="ts">
import type { OmnibarSurfaceProps } from './omnibarPrimitives.types'

let { children, class: className = '' }: OmnibarSurfaceProps = $props()
</script>

<div class={className}>{@render children?.()}</div>
