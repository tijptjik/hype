<script lang="ts">
// BITS COMPONENTS
import { Header as BitsHeader } from '$lib/bits/custom'
// TYPES
import type { HeaderTitleProps } from './headerPrimitives.types'

let {
  text,
  description,
  icon,
  href,
  crumbs = [],
  hideTitle = false,
  hideDescription = false,
}: HeaderTitleProps = $props()
</script>

<BitsHeader
  size="md"
  {icon}
  {href}
  {crumbs}
  {text}
  {description}
  {hideTitle}
  {hideDescription}
/>
