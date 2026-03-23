<script lang="ts">
import RowTitle from './RowTitle.svelte'
import { rowTitleSectionClass } from '../row.styles'
import type { RowTitleSectionProps } from '../row.types'

let {
  image,
  imageSrc,
  alt = 'Resource image',
  onImageClick,
  title = '',
  onTitleClick,
  description = '',
  onDescriptionClick,
}: RowTitleSectionProps = $props()
</script>

<div class={rowTitleSectionClass}>
  <RowTitle
    {image}
    {imageSrc}
    {alt}
    {onImageClick}
    {title}
    {onTitleClick}
    {description}
    {onDescriptionClick}
  />
</div>
