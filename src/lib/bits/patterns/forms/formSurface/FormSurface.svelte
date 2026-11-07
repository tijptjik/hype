<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'
// STYLES
import { formSurfaceStyles } from './formSurface.styles'
import { alignSectionHeaders } from './alignSectionHeaders.ts'
// TYPES
import type { Snippet } from 'svelte'

let { children, class: className = '' }: { children: Snippet; class?: string } =
  $props()
</script>

<div use:alignSectionHeaders data-form-surface class={cx(formSurfaceStyles, className)}>
  {@render children()}
</div>
