<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
import { cubicInOut } from 'svelte/easing'
import type { Component } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import Actions from './Actions.svelte'
import MoveAction from './MoveAction.svelte'
import Body from './Body.svelte'
import Root from './Root.svelte'
import Wrapper from './Wrapper.svelte'
// TRANSITIONS
import { createLayerPropertyTransfer } from '../layerPropertyCard.transitions'
// TYPES
import type { LayerPropertyTransfer } from '../layerPropertyCard.transitions'

type LayerPropertyRow = {
  index: number
  propertyId: string
  isVisible: boolean
  isUserContributable: boolean
  name: string
  scopeLabel: 'global' | 'hub' | 'org' | 'project'
  scopeTone: 'global' | 'hub' | 'org' | 'project'
  typeIconComponent: Component
  typeIconTitle: string | { toString(): string }
}

type HiddenField = {
  as: (kind: 'hidden', value: string) => Record<string, unknown>
}

type PropertyFieldRow = {
  propertyId?: HiddenField | null
  isVisible?: HiddenField | null
  isUserContributable?: HiddenField | null
}

type Props = {
  title: string
  description: string
  rows: LayerPropertyRow[]
  toRowFields?: (index: number) => unknown
  isEditing?: boolean
  isContributableDisabled?: boolean
  isFlipDisabled?: boolean
  transfer?: LayerPropertyTransfer
  onVisibleChange?: (index: number, value: boolean) => void
  onUserContributableChange?: (index: number, value: boolean) => void
}

let {
  title,
  description,
  rows,
  toRowFields,
  isEditing = false,
  isContributableDisabled = false,
  isFlipDisabled = false,
  transfer = createLayerPropertyTransfer(),
  onVisibleChange,
  onUserContributableChange,
}: Props = $props()
</script>

<section class="bits-form__section">
  <SectionHeader {title} {description}>
    {#snippet right()}
      <span
        class="border-primary/20 bg-primary/5 text-muted-foreground rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums"
      >
        {rows.length}
      </span>
    {/snippet}
  </SectionHeader>
  <Wrapper>
    {#each rows as row (row.propertyId)}
      <div
        class="relative w-full"
        in:transfer.receive={{ key: row.propertyId, disabled: isFlipDisabled }}
        out:transfer.send={{ key: row.propertyId, disabled: isFlipDisabled }}
        animate:flip={{
          duration: isFlipDisabled || prefersReducedMotion.current ? 0 : 420,
          easing: cubicInOut,
        }}
      >
        <Root>
          {#if isEditing && !row.isVisible}
            <MoveAction
              isVisible={false}
              onVisibleChange={value => onVisibleChange?.(row.index, value)}
            />
          {/if}
          <Body
            name={row.name}
            scopeLabel={row.scopeLabel}
            scopeTone={row.scopeTone}
            iconComponent={row.typeIconComponent}
            iconTitle={row.typeIconTitle.toString()}
          />
          <Actions
            showMoveAction={row.isVisible}
            isVisible={row.isVisible}
            isUserContributable={row.isUserContributable}
            {isEditing}
            {isContributableDisabled}
            onVisibleChange={value => onVisibleChange?.(row.index, value)}
            onUserContributableChange={value =>
              onUserContributableChange?.(row.index, value)}
          />

          {@const rowFields = (toRowFields?.(row.index) ??
            null) as PropertyFieldRow | null}
          {@const propertyIdAttrs = rowFields?.propertyId?.as('hidden', row.propertyId)}
          {@const visibleAttrs = rowFields?.isVisible?.as(
            'hidden',
            row.isVisible ? 'true' : 'false',
          )}
          {@const ugcAttrs = rowFields?.isUserContributable?.as(
            'hidden',
            row.isUserContributable ? 'true' : 'false',
          )}
          {#if propertyIdAttrs}
            <input {...propertyIdAttrs}>
          {/if}
          {#if visibleAttrs}
            <input {...visibleAttrs}>
          {/if}
          {#if ugcAttrs}
            <input {...ugcAttrs}>
          {/if}
        </Root>
      </div>
    {:else}
      <p class="text-muted-foreground py-6 text-sm">
        {m.admin__forms_project_fields_empty_title()}
      </p>
    {/each}
  </Wrapper>
</section>
