<script lang="ts" generics="G extends Record<string, unknown>">
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
// BITS
import Icon from '$lib/bits/custom/icon/Icon.svelte'

type GroupHeaderProps<G extends Record<string, unknown>> = {
  group: G
  isCollapsed?: boolean
  entityCount?: number
  onToggle?: () => void
}

let {
  group,
  isCollapsed = false,
  entityCount = 0,
  onToggle,
}: GroupHeaderProps<G> = $props()

function getGroupLabel(): string {
  const name = group?.name
  if (typeof name === 'string' && name.trim()) return name

  const label = group?.label
  if (typeof label === 'string' && label.trim()) return label

  const code = group?.code
  if (typeof code === 'string' && code.trim()) return code

  const id = group?.id
  if (typeof id === 'string' && id.trim()) return id
  if (typeof id === 'number') return id.toString()

  return 'Group'
}
</script>

<div
  class="flex h-10 flex-row items-center justify-between gap-2 rounded-2xl bg-transparent px-3  @container"
>
  <button
    type="button"
    class="flex h-12 cursor-pointer items-center gap-4 transition-opacity hover:opacity-80"
    aria-expanded={!isCollapsed}
    onclick={() => onToggle?.()}
  >
    <div
      class="rotate-90 text-base-content transition-transform duration-200"
      class:rotate-0={isCollapsed}
      aria-hidden="true"
    >
      <Icon src={ChevronRightIcon} size="md" strokeWidth={3.5} class="h-5 w-5" />
    </div>
    <h3 class="flex-shrink-1 text-xl font-bold uppercase text-base-content">
      {getGroupLabel()}
    </h3>
  </button>

  <small
    class="hidden select-text pr-3 text-sm capitalize text-base-content/50 @sm:block"
  >
    {entityCount} {entityCount === 1 ? 'Task' : 'Tasks'}
  </small>
</div>
