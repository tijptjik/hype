<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'

type AppMainProps = {
  children: import('svelte').Snippet
  isCompactAppMenu?: boolean
  class?: string
  style?: string
}

let {
  children,
  isCompactAppMenu = false,
  class: className = '',
  style = '',
}: AppMainProps = $props()
</script>

<main
  class={cx(
    'relative top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden transition-[padding] duration-260 ease-[ease]',
    isCompactAppMenu ? 'pb-14.75' : 'pb-20',
    'md:pb-0',
    className,
  )}
  {style}
>
  {@render children()}
</main>
