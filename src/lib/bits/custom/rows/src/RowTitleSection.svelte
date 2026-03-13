<script lang="ts">
import RowTitle from './RowTitle.svelte'
import type { RowTitleSectionProps } from '../row.types'

let {
  image,
  alt = 'Resource image',
  onImageClick,
  title = '',
  onTitleClick,
  description = '',
  onDescriptionClick,
}: RowTitleSectionProps = $props()
</script>

<div class="bits-resource-row__title">
  <RowTitle
    {image}
    {alt}
    {onImageClick}
    {title}
    {onTitleClick}
    {description}
    {onDescriptionClick}
  />
</div>
