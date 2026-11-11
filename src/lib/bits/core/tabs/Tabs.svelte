<script lang="ts">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// BITS UI
import { Tabs } from 'bits-ui'

let {
  value = $bindable(''),
  items,
  label,
  children,
  showList = true,
  class: rootClass = '',
  contentClass = '',
  panelClass = '',
}: {
  value?: string
  items: { value: string; label: string }[]
  label: string
  showList?: boolean
  class?: string
  contentClass?: string
  panelClass?: string
  children: Snippet<[string]>
} = $props()
// Mount on first visit, then preserve local form state across header navigation.
let visited = $state<string[]>([untrack(() => value)])
$effect(() => {
  if (!visited.includes(value)) visited = [...visited, value]
})
</script>

<Tabs.Root bind:value class={rootClass}>
  {#if showList}
    <Tabs.List
      aria-label={label}
      class="border-border flex gap-1 overflow-x-auto border-b px-6"
    >
      {#each items as item (item.value)}
        <Tabs.Trigger
          value={item.value}
          class="text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-primary shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
          >{item.label}</Tabs.Trigger
        >
      {/each}
    </Tabs.List>
  {/if}
  <div class="relative isolate overflow-hidden {contentClass}">
    {#each items as item (item.value)}
      <Tabs.Content value={item.value}>
        {#snippet child({ props })}
          <!-- Keep panel state mounted while inactive views fade out without accepting focus or input. -->
          <div
            {...props}
            role="tabpanel"
            hidden={false}
            aria-label={showList ? undefined : item.label}
            aria-labelledby={showList && typeof props['aria-labelledby'] === 'string'
              ? props['aria-labelledby']
              : undefined}
            aria-hidden={value !== item.value}
            inert={value !== item.value}
            class="{panelClass} min-w-0 transition-[opacity,visibility] duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-[-2px] motion-reduce:transition-none {value ===
            item.value
              ? 'visible relative opacity-100'
              : 'invisible pointer-events-none absolute inset-x-0 top-0 opacity-0'}"
          >
            {#if value === item.value || visited.includes(item.value)}
              {@render children(item.value)}
            {/if}
          </div>
        {/snippet}
      </Tabs.Content>
    {/each}
  </div>
</Tabs.Root>
