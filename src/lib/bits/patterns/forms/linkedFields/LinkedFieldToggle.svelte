<script lang="ts">
// COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import CommunityIcon from '#lib/bits/custom/icon/CommunityIcon.svelte'
import MixedIcon from 'virtual:icons/lucide/minus'
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { getLinkedFields, type LinkedField } from './linkedFields.svelte.js'
let {
  field,
  fields = [field],
  label,
}: { field: LinkedField; fields?: LinkedField[]; label: string } = $props()
const editor = getLinkedFields()
const community = $derived(fields.every(key => editor?.mode(key) === 'community'))
const mixed = $derived(
  !community && fields.some(key => editor?.mode(key) === 'community'),
)
const disabled = $derived(!community && !mixed && !editor?.canShare())
const description = $derived(
  mixed
    ? m.linked_sections_mixed({ field: label })
    : disabled
      ? m.linked_fields_internal_only({ field: label })
      : community
        ? `${label}: ${m.linked_sections_community()}. ${m.linked_sections_switch_internal()}`
        : `${label}: ${m.linked_sections_internal()}. ${m.linked_sections_switch_community()}`,
)
</script>

{#if editor?.available() && editor.expanded}
  <SimpleTooltip
    triggerProps={{ tabindex: -1 }}
    contentProps={{ side: 'bottom', 'aria-label': label }}
    contentClass="w-80 max-w-[calc(100vw-2rem)] p-4 text-left"
  >
    {#snippet trigger()}
      <button
        type="button"
        class="text-primary hover:bg-primary/10 focus-visible:outline-primary inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 disabled:opacity-50"
        aria-label={description}
        data-linked-field={field}
        data-linked-mode={mixed ? 'mixed' : community ? 'community' : 'internal'}
        {disabled}
        onclick={() => {
          const mode = community || mixed ? 'internal' : 'community'
          for (const key of fields) editor.change(key, mode)
        }}
      >
        {#if mixed}
          <MixedIcon class="size-4" aria-hidden="true" />
        {:else if community}
          <CommunityIcon class="size-4" aria-hidden="true" />
        {:else}
          <LockIcon class="size-4" aria-hidden="true" />
        {/if}
      </button>
    {/snippet}
    <div class="space-y-3 text-sm" data-linked-section-help>
      <p class="flex items-center gap-2 font-semibold">
        {#if mixed}
          <MixedIcon class="size-4 shrink-0" aria-hidden="true" />
          {m.linked_sections_mixed({ field: label })}
        {:else if community}
          <CommunityIcon class="size-4 shrink-0" aria-hidden="true" />
          {m.linked_sections_community()}
        {:else}
          <LockIcon class="size-4 shrink-0" aria-hidden="true" />
          {m.linked_sections_internal()}
        {/if}
      </p>
      <p class="flex items-start gap-2">
        {#if disabled}
          {m.linked_fields_internal_only({ field: label })}
        {:else if community || mixed}
          <LockIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {m.linked_sections_switch_internal()}
        {:else}
          <CommunityIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {m.linked_sections_switch_community()}
        {/if}
      </p>
      <p class="text-muted-foreground border-border border-t pt-3">
        {m.linked_sections_policy_reminder()}
      </p>
    </div>
  </SimpleTooltip>
{/if}
