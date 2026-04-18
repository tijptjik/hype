<script lang="ts">
import { Button } from '$lib/bits/core'
import type { SectionHeaderTrigger } from './types'

let {
  modifier = 'circle',
  style = 'ghost',
  color = 'primary',
  hideLabel = true,
  ...restProps
}: SectionHeaderTrigger = $props()
</script>

<Button {modifier} {style} {color} {hideLabel} {...restProps} />
