<script lang="ts">
import { flip } from 'svelte/animate'
import { cubicInOut } from 'svelte/easing'
import type { Component } from 'svelte'
import { SectionHeader } from '$lib/bits/custom/form'
import Actions from './Actions.svelte'
import Body from './Body.svelte'
import Root from './Root.svelte'
import Wrapper from './Wrapper.svelte'

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
  onVisibleChange,
  onUserContributableChange,
}: Props = $props()
</script>

<section class="bits-form__section">
  <SectionHeader {title} {description} />
  <Wrapper>
    {#each rows as row (row.propertyId)}
      <div
        class="bits-form__layer-card-item"
        animate:flip={{
          duration: isFlipDisabled ? 0 : 220,
          easing: cubicInOut,
        }}
      >
        <Root>
          <Body
            name={row.name}
            scopeLabel={row.scopeLabel}
            scopeTone={row.scopeTone}
            iconComponent={row.typeIconComponent}
            iconTitle={row.typeIconTitle.toString()}
          />
          <Actions
            isVisible={row.isVisible}
            isUserContributable={row.isUserContributable}
            {isEditing}
            {isContributableDisabled}
            onVisibleChange={value => onVisibleChange?.(row.index, value)}
            onUserContributableChange={value =>
              onUserContributableChange?.(row.index, value)}
          />

          {@const rowFields = (toRowFields?.(row.index) ?? null) as PropertyFieldRow | null}
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
    {/each}
  </Wrapper>
</section>
