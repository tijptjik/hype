<script lang="ts">
// ICONS
import LinkIcon from 'virtual:icons/lucide/link'
import CommunityIcon from '#lib/bits/custom/icon/CommunityIcon.svelte'
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { getLinkedFields } from './linkedFields.svelte.js'
const editor = getLinkedFields()
</script>

{#if editor?.available()}
  <div
    class="flex min-w-0 flex-wrap items-center justify-end gap-1"
    data-linked-fields-toolbar
  >
    {#if editor.expanded}
      <fieldset aria-label={m.linked_fields_filter()} class="flex flex-wrap gap-1">
        {#each ['community', 'internal'] as const as mode}
          <button
            type="button"
            class="hover:bg-primary/10 focus-visible:outline-primary aria-pressed:bg-primary/10 aria-pressed:text-primary inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs focus-visible:outline-2"
            aria-pressed={editor[mode]}
            onclick={() => (editor[mode] = !editor[mode])}
          >
            {#if mode === 'community'}
              <CommunityIcon class="size-4" aria-hidden="true" />
            {:else}
              <LockIcon class="size-4" aria-hidden="true" />
            {/if}
            {mode === 'community'
              ? m.location_visibility_shared()
              : m.location_visibility_exclusive()}
          </button>
        {/each}
      </fieldset>
    {/if}
    <button
      type="button"
      class="text-muted-foreground hover:bg-primary/10 focus-visible:outline-primary aria-pressed:text-primary inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs focus-visible:outline-2"
      aria-label={m.linked_fields_sections()}
      title={m.linked_fields_sections()}
      aria-pressed={editor.expanded}
      onclick={() => (editor.expanded = !editor.expanded)}
    >
      <LinkIcon class="size-4" aria-hidden="true" />
      <span>{m.linked_fields_sections()}</span>
    </button>
  </div>
{/if}
