<script lang="ts">
import TextAction from './src/TextAction.svelte'
import { textTitleClass } from './text.styles'
import type { TextTitleProps } from './text.types'

let { text, onClick, tabIndex }: TextTitleProps = $props()
</script>

<TextAction
  {text}
  {onClick}
  {tabIndex}
  separator="•"
  padding={32}
  class={textTitleClass}
/>
