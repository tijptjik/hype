<script lang="ts">
import { slide } from 'svelte/transition'
import { Button } from '$lib/bits/core'
import { Search, SectionHeader } from '$lib/bits/custom'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
import { OrganisationCard } from '$lib/bits/patterns/organisationCard'
import { getImageSrc } from '$lib/client/services/image'
import { m } from '$lib/i18n'
import ReplaceIcon from 'virtual:icons/lucide/replace'
import XIcon from 'virtual:icons/lucide/x'
import type {
  FormParentProjectSectionProps,
  ParentSectionProjectItem,
} from './formParentSection.types'

let {
  title,
  subtitle,
  issues = [],
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
  if (!showModeUi) return
  if (!isSubmitRequested) return
  if (issues.length === 0) return
  isAdding = true
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
    {#snippet center()}
      <SectionHeaderPrimitive.Issues {issues} />
    {/snippet}
    {#snippet right()}
      {#if isEditing}
        <div
          class="bits-form__hub-orgs-header-actions flex flex-row items-center justify-end gap-0"
        >
          <Button
            text={isAdding ? m.cancel() : m.replace()}
            style="ghost"
            color="light"
            size="sm"
            iconComponent={isAdding ? XIcon : ReplaceIcon}
            onClick={toggleAdding}
            disabled={isSubmitting}
            class="bits-form__hub-orgs-replace-btn whitespace-nowrap h-10"
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
        placeholder={m.forms__search_placeholder()}
        focusOnMount={true}
        onInput={onSearchProjects as any}
        excludeIds={currentParentId ? [currentParentId] : []}
        getItemId={(project: any) => project.id}
        onSelect={handleReplaceParent as any}
        resultMap={{
          image: (project: any) =>
            getImageSrc((project as ParentSectionProjectItem).image, {
              transformation: 'c_fill,h_96,w_96',
            }),
          title: (project: any) => project.i18n?.en?.name || project.code,
          descriminator: (project: any) => project.code ?? null,
        }}
      />
    </div>
  {/if}

  <div class="bits-form__hub-orgs-list">
    {#if parent}
      <OrganisationCard.Root>
        <OrganisationCard.Media
          image={getImageSrc(parent.image, {
            transformation: 'c_fill,h_96,w_96',
          })}
          alt={parent.i18n?.en?.name || parent.code}
        />
        <OrganisationCard.Body
          code={parent.code}
          name={parent.i18n?.en?.name || parent.code}
        />
      </OrganisationCard.Root>
    {/if}
  </div>

  {#if hiddenProjectInputAttrs}
    <div class="hidden" aria-hidden="true"><input {...hiddenProjectInputAttrs}></div>
  {/if}
</section>
