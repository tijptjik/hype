<script lang="ts">
import { slide } from 'svelte/transition'
import { Button } from '$lib/bits/core'
import { Search, SectionHeader } from '$lib/bits/custom'
import { LayerCard } from '$lib/bits/patterns/layerCard'
import ReplaceIcon from 'virtual:icons/lucide/replace'
import XIcon from 'virtual:icons/lucide/x'
import type {
  FormParentProjectSectionProps,
  ParentSectionProjectItem,
} from './formParentSection.types'

let {
  title,
  subtitle,
  parent,
  hiddenProjectInputAttrs = null,
  isEditing = true,
  isSubmitting = false,
  isSubmitRequested = false,
  startInAddingMode = false,
  onSearchProjects,
  onReplaceParent,
  class: className = '',
}: FormParentProjectSectionProps = $props()

let isAdding = $state(false)
let wasSubmitRequested = $state(false)
let hasAutoOpenedAdding = $state(false)

const showModeUi = $derived(isEditing && !isSubmitting)
const currentParentId = $derived(parent?.id ?? '')

function toggleAdding(): void {
  isAdding = !isAdding
}

function handleReplaceParent(project: ParentSectionProjectItem): void {
  onReplaceParent(project)
  isAdding = false
}

$effect(() => {
  if (!isAdding) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isAdding = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (showModeUi) return
  isAdding = false
})

$effect(() => {
  if (isSubmitRequested && !wasSubmitRequested) {
    isAdding = false
  }
  wasSubmitRequested = isSubmitRequested
})

$effect(() => {
  if (hasAutoOpenedAdding) return
  if (!startInAddingMode) return
  if (!showModeUi) return
  if (currentParentId.length > 0) return
  isAdding = true
  hasAutoOpenedAdding = true
})
</script>

<section class={`bits-form__section bits-form__hub-orgs ${className}`}>
  <SectionHeader {title} description={subtitle} class="bits-form__hub-orgs-header">
    {#snippet right()}
      {#if isEditing}
        <div
          class="bits-form__section-header-actions flex w-full flex-row items-center justify-end gap-0"
        >
          <Button
            text={isAdding ? m.cancel() : 'Replace'}
            style="ghost"
            color="light"
            size="sm"
            iconComponent={isAdding ? XIcon : ReplaceIcon}
            onClick={toggleAdding}
            disabled={!isEditing || isSubmitting}
            class="bits-form__section-header-action-btn whitespace-nowrap h-10"
          />
        </div>
      {/if}
    {/snippet}
  </SectionHeader>

  {#if isAdding && showModeUi}
    <div
      transition:slide={{ duration: showModeUi ? 200 : 0 }}
      class="bits-form__hub-orgs-search"
    >
      <Search
        placeholder="Search projects..."
        focusOnMount={true}
        onInput={onSearchProjects as any}
        excludeIds={currentParentId ? [currentParentId] : []}
        getItemId={(project: any) => project.id}
        onSelect={handleReplaceParent as any}
        resultMap={{
          image: () => null,
          title: (project: any) => project.i18n?.en?.name || project.code,
          descriminator: (project: any) => project.code ?? null,
        }}
      />
    </div>
  {/if}

  <div class="bits-form__hub-orgs-list">
    {#if parent}
      <LayerCard.Root>
        <LayerCard.Body
          code={parent.code}
          name={parent.i18n?.en?.name || parent.code}
        />
      </LayerCard.Root>
    {/if}
  </div>

  {#if hiddenProjectInputAttrs}
    <div class="hidden" aria-hidden="true"><input {...hiddenProjectInputAttrs}></div>
  {/if}
</section>
