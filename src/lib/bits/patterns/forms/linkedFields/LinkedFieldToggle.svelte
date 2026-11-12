<script lang="ts">
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
        ? m.linked_fields_to_internal({ field: label })
        : m.linked_fields_to_community({ field: label }),
)
</script>

{#if editor?.available() && editor.expanded}
  <button
    type="button"
    class="text-primary hover:bg-primary/10 focus-visible:outline-primary inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 disabled:opacity-50"
    aria-label={description}
    title={description}
    data-tooltip={description}
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
{/if}
