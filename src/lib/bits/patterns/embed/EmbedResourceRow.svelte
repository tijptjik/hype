<script lang="ts">
// COMPONENTS
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'
import CardActions from '#lib/bits/custom/card/components/Actions.svelte'
import Checkbox from '#lib/bits/custom/checkbox/Checkbox.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import EyeIcon from 'virtual:icons/proicons/eye'

let {
  name,
  kind,
  checked,
  mixed = false,
  onToggle,
  defaultOn,
  defaultDisabled = false,
  onDefault,
}: {
  name: string
  kind: string
  checked: boolean
  mixed?: boolean
  onToggle: () => void
  defaultOn?: boolean
  defaultDisabled?: boolean
  onDefault?: (checked: boolean) => void
} = $props()
const id = $props.id()
</script>

<ResourceCard.Root
  class="border-border bg-foreground/4 min-h-14 rounded-lg border bg-none shadow-none before:hidden"
>
  <div class="flex min-w-0 flex-1 items-center gap-2 pl-5">
    <Checkbox
      id={`${id}-include`}
      {checked}
      indeterminate={mixed}
      onCheckedChange={onToggle}
      size="sm"
    />
    <label for={`${id}-include`} class="min-w-0 flex-1 cursor-pointer">
      <span class="sr-only">{name}</span>
      <span aria-hidden="true"
        ><ResourceCard.Body code={kind} {name} wrapTitle class="pl-0!" /></span
      >
    </label>
  </div>
  {#if onDefault}
    <CardActions
      padding="md"
      gap={8}
      bg="none"
      class="border-border/60 w-auto! min-w-0! shrink-0 border-l"
    >
      <label
        for={`${id}-default`}
        title="On by default"
        class="flex items-center gap-2 text-xs"
      >
        <EyeIcon class="size-4" />
        <span class="sr-only">{name}: on by default</span>
      </label>
      <Switch
        id={`${id}-default`}
        checked={defaultOn}
        disabled={defaultDisabled}
        size="sm"
        onCheckedChange={value => onDefault?.(value === true)}
      />
    </CardActions>
  {/if}
</ResourceCard.Root>
