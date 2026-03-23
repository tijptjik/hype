<script lang="ts">
import { FormGrid } from '$lib/bits/patterns/layout'
import { SimpleTooltip } from '$lib/bits/core'
import { Card, SectionHeader, Switch } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import { m } from '$lib/i18n'
import EyeIcon from 'virtual:icons/lucide/eye'
import type { FormHubLayersSectionProps } from './formHubLayersSection.types'

let {
  title,
  subtitle,
  items,
  issues = [],
  hiddenLayerDefaultInputAttrs = [],
  isEditing = true,
  isSubmitting = false,
  onToggleDefault,
  class: className = '',
}: FormHubLayersSectionProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
</script>

<section class={`bits-form__section bits-form__parent-resource ${className}`}>
  <SectionHeader
    {title}
    description={subtitle}
    issueMessages={issues}
    class="bits-form__parent-resource-header"
  />

  <FormGrid minWidth={360}>
    {#each items as item (item.id)}
      <ResourceCard.Root>
        <ResourceCard.Body code={item.projectNameShort} name={item.layerName} />
        <Card.Actions
          padding="md"
          bg="panel"
          class="bits-form__parent-resource-actions-rail bits-form__hub-layer-actions-rail"
        >
          <div class="bits-form__parent-resource-actions bits-form__hub-layer-actions">
            <SimpleTooltip>
              {#snippet trigger()}
                <label
                  class="bits-form__parent-resource-default bits-form__hub-layer-default"
                >
                  <span
                    class="bits-form__parent-resource-default-icon bits-form__hub-layer-default-icon"
                  >
                    <EyeIcon />
                  </span>
                  <span
                    class="bits-form__parent-resource-default-label bits-form__hub-layer-default-label"
                  >
                    {m.default_enabled()}
                  </span>
                  <Switch
                    checked={item.isDefaultVisible}
                    disabled={isDisabled}
                    size="md"
                    class="bits-form__hub-layer-default-switch"
                    onCheckedChange={value => onToggleDefault(item.id, value === true)}
                  />
                </label>
              {/snippet}
              {m.admin__forms_layer_visible_by_default()}
            </SimpleTooltip>
          </div>
        </Card.Actions>
      </ResourceCard.Root>
    {/each}
  </FormGrid>

  <div class="hidden" aria-hidden="true">
    {#each hiddenLayerDefaultInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
