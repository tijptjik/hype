<script lang="ts">
import type { MainSectionProps } from './main.types'

let { children, class: className = '', isVisible = true }: MainSectionProps = $props()

const sectionClass = $derived(
  ['bits-main__section', isVisible ? '' : 'bits-main__section--hidden', className]
    .filter(Boolean)
    .join(' '),
)
</script>

<section class={sectionClass}>{@render children?.()}</section>
