<script lang="ts">
import { customAlphabet } from 'nanoid'
import { flip } from 'svelte/animate'
import { tick } from 'svelte'
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte'
import PropertyTypeActions from '$lib/components/forms/actions/PropertyType.svelte'
import PropertyFields from '$lib/components/forms/fields/Property.svelte'
//CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types'
// TYPES
import type {
  SectionProps,
  PropertyNew,
  ProjectForm,
  FormFieldArray,
  Property,
  Id,
  FormFieldArrayDefinition,
} from '$lib/types'

// CONFIG
const fieldRoot = 'properties' as const

// NANOID
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12,
)

// STATE : PROPS
let sectionProps: SectionProps = $props()
let { fieldDiscriminator, fields } = sectionProps

let searchMode = $state(false)
let removeMode = $state(false)
let confirmationMode = $state(false)
let confirmingId = $state(undefined)

// STATE : FORM
const superFormObj = sectionProps.form as ProjectForm
const form = superFormObj.form

let propsInSection = $derived(
  ($form[fieldRoot]?.filter(p => p.type === fieldDiscriminator) || []).sort(
    (a, b) => a.rank - b.rank,
  ),
)

// ***
// PROPERTY FIELDS
// ***

const addAction = async (e: Event) => {
  e.preventDefault()
  e.stopPropagation()
  const id = nanoid(12)
  const defaultLabel = ''
  const newProperty: PropertyNew & { id: Id } = {
    id: id,
    projectId: $form.id,
    type: fieldDiscriminator as 'classifier' | 'specifier',
    key: id,
    rank: 0,
    component:
      fieldDiscriminator === 'classifier'
        ? classifierComponentTypes[0]
        : specifierComponentTypes[0],
    isTranslatable: fieldDiscriminator === 'classifier',
    values: fieldDiscriminator === 'classifier' ? [] : null,
    min: null,
    max: null,
    i18n: {
      en: {
        locale: 'en',
        propertyId: id,
        label: defaultLabel,
        labelGen: false,
        placeholder: '',
        placeholderGen: false,
      },
      'zh-hant': {
        locale: 'zh-hant',
        propertyId: id,
        label: defaultLabel,
        labelGen: false,
        placeholder: '',
        placeholderGen: false,
      },
      'zh-hans': {
        locale: 'zh-hans',
        propertyId: id,
        label: defaultLabel,
        labelGen: false,
        placeholder: '',
        placeholderGen: false,
      },
    },
  }
  form.update($form => {
    const currentProperties = $form[fieldRoot]
    if (currentProperties) {
      currentProperties.unshift(newProperty as Property)
      // Re-rank all properties of this type
      const propsOfType = currentProperties.filter(p => p.type === fieldDiscriminator)
      propsOfType.sort((a, b) => a.rank - b.rank) // ensure stable before re-assigning
      propsOfType.forEach((p, idx) => (p.rank = idx))
    }
    return $form
  })
}

const removeAction = (e: Event, propertyId: Id) => {
  e.preventDefault()
  e.stopPropagation()
  form.update($form => {
    const propIndex = $form[fieldRoot]?.findIndex(p => p.id === propertyId)
    const currentProperties = $form[fieldRoot]
    if (currentProperties) {
      currentProperties.splice(propIndex as number, 1)
      // Re-rank remaining properties of this type
      const propsOfType = currentProperties.filter(p => p.type === fieldDiscriminator)
      propsOfType.sort((a, b) => a.rank - b.rank) // ensure stable before re-assigning
      propsOfType.forEach((p, idx) => (p.rank = idx))
    }
    return $form
  })
  if ($form[fieldRoot]?.length === 0) {
    removeMode = false
  }
}

async function scrollToProperty(propertyId: Id) {
  // Scroll after form update and DOM re-render
  if (propertyId) {
    await tick()
    const wrapperElement = document.getElementById(`property-wrapper-${propertyId}`)
    if (wrapperElement) {
      const h2Element = wrapperElement.querySelector('h2')
      if (h2Element) {
        h2Element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        // Fallback if h2 is not found, scroll the wrapper itself
        wrapperElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }
}

const changeRank = async (propertyIdToMove: Id, direction: 'up' | 'down') => {
  form.update($form => {
    const allProperties = ($form[fieldRoot] || []) as Property[]
    // Work with a copy for manipulation within this update
    let relevantProps = allProperties
      .filter(p => p.type === fieldDiscriminator)
      .sort((a, b) => a.rank - b.rank) // Ensure relevantProps is sorted by rank before finding index

    const currentIndexInRelevant = relevantProps.findIndex(
      p => p.id === propertyIdToMove,
    )
    if (currentIndexInRelevant === -1) return $form // Property not found in relevant list

    let newIndexInRelevant: number
    if (direction === 'up') {
      if (currentIndexInRelevant === 0) return $form // Already at the top
      newIndexInRelevant = currentIndexInRelevant - 1
    } else {
      // direction === 'down'
      if (currentIndexInRelevant === relevantProps.length - 1) return $form // Already at the bottom
      newIndexInRelevant = currentIndexInRelevant + 1
    }

    // Perform the move within the relevantProps array
    const [movedItem] = relevantProps.splice(currentIndexInRelevant, 1)
    relevantProps.splice(newIndexInRelevant, 0, movedItem)

    // Update ranks for all items in relevantProps based on their new order
    relevantProps.forEach((p, idx) => {
      p.rank = idx
    })

    const newAllProperties = allProperties.map(originalProp => {
      if (originalProp.type === fieldDiscriminator) {
        const newRankFromMap = relevantProps.find(p => p.id === originalProp.id)?.rank
        // Check if newRankFromMap is defined (it should be for all relevant props)
        // and if the rank actually changed or if we just want to ensure a new object instance.
        if (newRankFromMap !== undefined) {
          // We create new object instance for all relevant items to ensure child components re-evaluate props.
          return { ...originalProp, rank: newRankFromMap }
        }
      }
      return originalProp // Return original object if no change or not relevant type
    })

    $form[fieldRoot] = newAllProperties as Property[]
    return $form
  })
  await scrollToProperty(propertyIdToMove)
}

const increaseRankAction = async (e: Event, propertyId: Id) => {
  e.preventDefault()
  e.stopPropagation()
  await changeRank(propertyId, 'up')
}

const decreaseRankAction = async (e: Event, propertyId: Id) => {
  e.preventDefault()
  e.stopPropagation()
  await changeRank(propertyId, 'down')
}

const actions = {
  add: addAction,
  remove: removeAction,
  increaseRank: increaseRankAction,
  decreaseRank: decreaseRankAction,
}
</script>

<div class="z-10 flex flex-col gap-0 rounded-2xl bg-transparent pt-4 @container">
  <Header {...sectionProps} {fields}>
    {#snippet actionContent()}
      <PropertyTypeActions {actions} bind:removeMode />
    {/snippet}
  </Header>
  {#if $form[fieldRoot]}
    {#each propsInSection as property, relevantIndex (property.id)}
      <div animate:flip={{ duration: 200 }} id={`property-wrapper-${property.id}`}>
        <PropertyFields
          form={superFormObj}
          {fieldRoot}
          propertyId={property.id}
          fields={(fields[fieldRoot] as FormFieldArrayDefinition).discriminators.specs[
            fieldDiscriminator as 'classifier' | 'specifier'
          ]}
          fieldIndex={$form[fieldRoot].findIndex((p) => p.id === property.id)}
          {actions}
          totalItemsOfThisType={propsInSection.length}
          bind:searchMode
          bind:removeMode
          bind:confirmationMode
          bind:confirmingId
        />
      </div>
    {/each}
  {/if}
</div>
