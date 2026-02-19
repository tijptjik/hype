<script lang="ts">
let {
  onclick,
  onkeydown,
  index,
  isSelected = false,
  gridColsClass,
  resourceType,
  children,
}: {
  onclick: (event: MouseEvent) => void
  onkeydown: (event: KeyboardEvent) => void
  index: number
  isSelected?: boolean
  gridColsClass: string
  children: () => any
} = $props()
</script>

<div
  {onclick}
  {onkeydown}
  tabindex="0"
  role="button"
  data-entity-index={index}
  class="grid cursor-pointer items-center gap-4 rounded-lg bg-glass-result
         p-2 caret-transparent shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2
         focus:ring-offset-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary active:ring-0
         {gridColsClass} hover:shadow-[0_0_25px_var(--color-primary)]"
  class:ring-2={isSelected}
  class:ring-primary={isSelected}
  class:ring-offset-2={isSelected}
>
  {@render children()}
</div>
