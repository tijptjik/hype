<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'
// STYLES
import { formSurfaceStyles } from './formSurface.styles'
// TYPES
import type { Snippet } from 'svelte'

let { children, class: className = '' }: { children: Snippet; class?: string } =
  $props()
</script>

<div data-form-surface class={cx(formSurfaceStyles, className)}>
  {@render children()}
</div>
