<script lang="ts">
// COMPONENTS
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
// PRESENTATION
import { historyStyles as styles } from './organisationHistory.styles'
// ICONS
import ProfileIcon from 'virtual:icons/proicons/person-multiple'
import FieldsIcon from 'virtual:icons/proicons/text'

let {
  showStaff = false,
  showFields = true,
  historyKind = 'profile',
  pending = false,
  onSelect,
}: {
  showStaff?: boolean
  showFields?: boolean
  historyKind?: 'profile' | 'fields' | 'staff'
  allExpanded?: boolean
  pending?: boolean
  onSelect?: (kind: 'profile' | 'fields' | 'staff') => void
  onToggle?: (collapsed: boolean) => void
} = $props()
</script>

<!-- Read-only history uses a plain category row instead of a form heading. -->
<SectionHeader
  class="border-border/50 h-auto! min-h-12! gap-y-1 border-y bg-transparent! px-5 max-sm:grid-cols-1! [&_.bits-form\_\_section-header-left]:overflow-visible! [&_.bits-form\_\_section-header-right]:[container-type:normal]! max-sm:[&_.bits-form\_\_section-header-right]:justify-end"
>
  {#snippet left()}
    <fieldset
      class="grid w-full min-w-0 grid-cols-2 items-stretch gap-x-4 sm:flex sm:w-auto"
      aria-label="History category"
    >
      <button
        type="button"
        class={styles.tab}
        aria-pressed={historyKind === 'profile'}
        disabled={pending}
        onclick={() => onSelect?.('profile')}
      >
        <ProfileIcon class="size-4 shrink-0" aria-hidden="true" />
        <span class="min-w-0 whitespace-normal">Profile and settings</span>
      </button>
      {#if showFields}
        <button
          type="button"
          class={styles.tab}
          aria-pressed={historyKind === 'fields'}
          disabled={pending}
          onclick={() => onSelect?.('fields')}
        >
          <FieldsIcon class="size-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 whitespace-normal">Field definitions</span>
        </button>
      {/if}
      {#if showStaff}
        <button
          type="button"
          class={styles.tab}
          aria-pressed={historyKind === 'staff'}
          disabled={pending}
          onclick={() => onSelect?.('staff')}
        >
          <ProfileIcon class="size-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 whitespace-normal">Staff roles</span>
        </button>
      {/if}
    </fieldset>
  {/snippet}
</SectionHeader>
