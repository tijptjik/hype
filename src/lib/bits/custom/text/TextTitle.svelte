<script lang="ts">
import TextAction from './src/TextAction.svelte'
import type { TextTitleProps } from './text.types'

let { text, onClick }: TextTitleProps = $props()
</script>

<TextAction
  {text}
  {onClick}
  separator="⸱"
  padding={32}
  class="cursor-pointer font-medium text-base-content"
/>
