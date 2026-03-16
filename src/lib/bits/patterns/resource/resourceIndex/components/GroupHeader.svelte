<script lang="ts" generics="G extends Record<string, unknown>">
import ChevronDownIcon from 'virtual:icons/lucide/chevron-down'
// BITS
import Icon from '$lib/bits/custom/icon/Icon.svelte'

type GroupHeaderProps<G extends Record<string, unknown>> = {
  group: G
  isCollapsed?: boolean
  entityCount?: number
}

let {
  group,
  isCollapsed = $bindable(false),
  entityCount = 0,
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

<button
  type="button"
  class="bits-resource-group-header"
  aria-expanded={!isCollapsed}
  onclick={() => (isCollapsed = !isCollapsed)}
>
  <span class="bits-resource-group-header__content">
    <span class="bits-resource-group-header__title">{getGroupLabel()}</span>
    <span class="bits-resource-group-header__count">{entityCount}</span>
  </span>
  <span
    class="bits-resource-group-header__icon"
    class:bits-resource-group-header__icon--collapsed={isCollapsed}
    aria-hidden="true"
  >
    <Icon src={ChevronDownIcon} size="sm" />
  </span>
</button>
