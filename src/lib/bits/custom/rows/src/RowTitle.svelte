<script lang="ts">
import { TextDescription, TextTitle } from '$lib/bits/custom/text'
import RowThumbnail from './RowThumbnail.svelte'
import type { RowTitleProps } from '../row.types'

let {
  image,
  alt = 'Resource image',
  onImageClick,
  title = '',
  onTitleClick,
  description = '',
  onDescriptionClick,
}: RowTitleProps = $props()
</script>

<div class="flex items-center gap-4">
  <RowThumbnail {image} {alt} onClick={onImageClick} />
  <div class="flex flex-col overflow-hidden pt-1">
    <TextTitle text={title} onClick={onTitleClick} />
    <TextDescription text={description} onClick={onDescriptionClick} />
  </div>
</div>
