<script lang="ts">
import { TextDescription, TextTitle } from '$lib/bits/custom/text'
import RowThumbnail from './RowThumbnail.svelte'
import { rowTitleClass, rowTitleContentClass } from '../row.styles'
import type { RowTitleProps } from '../row.types'

let {
  image,
  imageSrc,
  alt = 'Resource image',
  onImageClick,
  title = '',
  onTitleClick,
  description = '',
  onDescriptionClick,
}: RowTitleProps = $props()
</script>

<div class={rowTitleClass}>
  <RowThumbnail {image} {imageSrc} {alt} onClick={onImageClick} />
  <div class={rowTitleContentClass}>
    <TextTitle text={title} onClick={onTitleClick} tabIndex={-1} />
    <TextDescription text={description} onClick={onDescriptionClick} tabIndex={-1} />
  </div>
</div>
