<script lang="ts">
import TextAction from './src/TextAction.svelte'
import { getTextDescriptionClass } from './text.styles'
import type { TextDescriptionProps } from './text.types'

let { text, onClick, tabIndex }: TextDescriptionProps = $props()
</script>

<TextAction
  {text}
  {onClick}
  {tabIndex}
  separator="•"
  padding={24}
  class={getTextDescriptionClass(Boolean(onClick))}
/>
