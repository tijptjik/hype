<script lang="ts">
import { getFieldComponent } from '$lib'
// Components
import Header from '$lib/components/forms/extra/Header.svelte'
// Types
import type { SectionProps } from '$lib/types'

// STATE : PROPS
let sectionProps: SectionProps = $props()
let { fields } = sectionProps
</script>

<div class="basis-1/3 overflow-hidden rounded-2xl p-0" style="transition: none;">
  <Header {...sectionProps} />
  <div class="flex flex-wrap items-baseline gap-4 pt-4">
    <div class="group flex flex-grow flex-col gap-4">
      {#each Object.entries(fields) as [ fieldRoot, field ]}
        {@const Field = getFieldComponent(field.component)}
        <div
          class="bg-grain rounded-xl border-3 border-primary bg-glass-300 px-6 pb-6 pt-2"
        >
          <Field
            fieldRoot={fieldRoot as 'properties'}
            {field}
            locale="core"
            fieldIndex={0}
            fieldKey="value"
            fieldDiscriminator="display"
            {...sectionProps}
          />
        </div>
      {/each}
    </div>
  </div>
</div>
