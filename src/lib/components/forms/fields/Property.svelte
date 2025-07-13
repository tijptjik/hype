<script lang="ts">
// I18N
import { m } from '$lib/i18n';
import { getLocale } from '$lib/i18n';
// LIB
import { customAlphabet } from 'nanoid';
import { getFieldComponent, isNotLocale } from '$lib';
import { supportedLocales } from '$lib/enums';
// SVELTE
import { slide } from 'svelte/transition';
// COMPONENTS
import RemoveShim from '$lib/components/forms/shims/Remove.svelte';
import ConfirmShim from '$lib/components/forms/shims/Confirm.svelte';
import FauxInput from '$lib/components/forms/fields/FauxInput.svelte';
import TranslationBar from '$lib/components/forms/bars/Translation.svelte';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import {
  ArrowUp,
  ArrowDown,
  Language as LanguageIcon,
  Plus
} from '@steeze-ui/heroicons';
// TYPES
import type {
  ProjectForm,
  Key,
  FormFieldExtendedDefinition,
  FieldComponentType,
  PropertyValue,
  Locale,
  Id
} from '$lib/types';

// STATE : INTERMEDIATE VALUES
type IntermediateValue = {
  id: string;
  rank: number;
  originalIndex: number;
  en: string;
  enGen: boolean;
  'zh-hans': string;
  'zh-hansGen': boolean;
  'zh-hant': string;
  'zh-hantGen': boolean;
};

// NANOID
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12
);

type PropertyFieldProps = {
  searchMode: boolean;
  removeMode: boolean;
  confirmationMode: boolean;
  confirmingId: string | undefined;
  fieldRoot: 'properties';
  fieldIndex: number;
  fields: Record<Key, FormFieldExtendedDefinition>;
  actions: Record<string, (...args: any[]) => void>;
  form: ProjectForm;
  onSort?: (items: IntermediateValue[]) => IntermediateValue[]; // For re-ranking
  // Props for rank controls from parent PropertyType.svelte
  totalItemsOfThisType: number;
  propertyId: Id;
};

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false),
  confirmationMode = $bindable(false),
  confirmingId = $bindable(undefined),
  onSort = (items) => items.sort((a, b) => a.rank - b.rank), // Default sort by rank
  ...fieldProps
}: PropertyFieldProps = $props();

let { fieldRoot, fields, actions, totalItemsOfThisType, propertyId } = fieldProps;

// STATE : FORM
const formStore = fieldProps.form.form;
const errorsStore = fieldProps.form.errors;

// STATE : INTERMEDIATE VALUES
let complexValues: IntermediateValue[] = $state([]);

// STATE : DERIVED VALUES
let currentProperty = $derived($formStore[fieldRoot]?.find((p) => p.id === propertyId));

// Make title reactive to property changes
let propertyTitle = $derived(
  $formStore[fieldRoot]?.find((p) => p.id === propertyId)?.i18n?.[getLocale() as Locale]
    ?.label || m.deft_dry_chipmunk_blink()
);

// STATE : LOCAL UI
let collapsed = $state(false);

// Sync Form to Complex Values
const syncFormToComplexValues = () => {
  if (currentProperty && currentProperty.values) {
    complexValues = currentProperty.values
      .map((v: PropertyValue, originalIndex: number) => {
        return {
          id: v.id,
          rank: v.rank,
          originalIndex,
          en: v.i18n?.en?.value || '',
          enGen: v.i18n?.en?.valueGen || false,
          'zh-hans': v.i18n?.['zh-hans']?.value || '',
          'zh-hansGen': v.i18n?.['zh-hans']?.valueGen || false,
          'zh-hant': v.i18n?.['zh-hant']?.value || '',
          'zh-hantGen': v.i18n?.['zh-hant']?.valueGen || false
        };
      })
      .sort((a: IntermediateValue, b: IntermediateValue) => a.rank - b.rank);
  } else {
    complexValues = [];
  }
};

// Sync Complex Values to Form
const syncComplexValuesToForm = () => {
  formStore.update(($formValue) => {
    const propertyToUpdateInForm = $formValue[fieldRoot]?.find(
      (p) => p.id === propertyId
    );
    if (propertyToUpdateInForm) {
      const sortedValues = onSort([...complexValues]);
      propertyToUpdateInForm.values = sortedValues.map(
        (v: IntermediateValue, index: number): PropertyValue => {
          return {
            id: v.id,
            propertyId: propertyId!,
            rank: index,
            i18n: {
              en: {
                propertyValueId: v.id,
                locale: 'en',
                value: v.en,
                valueGen: v.enGen
              },
              'zh-hant': {
                propertyValueId: v.id,
                locale: 'zh-hant',
                value: v['zh-hant'],
                valueGen: v['zh-hantGen']
              },
              'zh-hans': {
                propertyValueId: v.id,
                locale: 'zh-hans',
                value: v['zh-hans'],
                valueGen: v['zh-hansGen']
              }
            }
          };
        }
      );
    }
    return $formValue;
  });
};

$effect(() => {
  const _dependency = currentProperty?.values;
  syncFormToComplexValues();
});

// Add helper function to reset modes
function resetModes(closeRemove: boolean = true) {
  if (closeRemove) {
    removeMode = false;
  }
  confirmationMode = false;
  confirmingId = undefined;
}

function resetComplexModes(closeRemove: boolean = true) {
  if (closeRemove) {
    complexActionProps.removeMode = false;
  }
  complexActionProps.confirmingId = undefined;
}

// Add helper to check if current item is being confirmed
function isConfirming(itemId: string) {
  return confirmationMode && confirmingId === itemId;
}

// COMPLEX ACTIONS
const updateValue = (e: Event, valueId: string, locale: string) => {
  e.preventDefault();
  e.stopPropagation();
  const targetValue = complexValues.find((v) => v.id === valueId);
  if (targetValue) {
    (targetValue as any)[locale] = (e.target as HTMLElement).innerText;
    // Set the corresponding Gen field to false when human edits
    (targetValue as any)[`${locale}Gen`] = false;
  }
  syncComplexValuesToForm();
};

const addValue = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  const newId = nanoid();
  // Add with a temporary rank, then re-rank
  const tempRank = complexValues.length;
  complexValues = [
    ...complexValues,
    {
      id: newId,
      rank: tempRank, // Assign temporary rank
      originalIndex: tempRank,
      en: '',
      enGen: false,
      'zh-hans': '',
      'zh-hansGen': false,
      'zh-hant': '',
      'zh-hantGen': false
    }
  ];
  syncComplexValuesToForm(); // This will call onSort internally
};

const removeValue = (e: Event, valueId: Id) => {
  e.preventDefault();
  e.stopPropagation();
  // ACTION : Remove value from complexValues
  complexValues = complexValues.filter((v) => v.id !== valueId);
  // ACTION : Sync complexValues to form
  syncComplexValuesToForm(); // This will call onSort internally
  // ACTION : Reset confirm mode if the removed value was being confirmed
  if (confirmingId === valueId) {
    resetComplexModes(false);
  }
};

const complexActions = {
  add: addValue,
  remove: removeValue,
  update: updateValue,
  syncUp: syncComplexValuesToForm
};

const complexActionProps = $state({
  dragMode: false,
  removeMode: false,
  removeModeLocale: undefined,
  confirmingId: undefined
});

const isVisible = (field: FormFieldExtendedDefinition) => {
  if (!currentProperty) return false;
  return (
    !field.showForComponent ||
    (field.showForComponent &&
      field.showForComponent.includes(currentProperty.component as FieldComponentType))
  );
};

// Create a derived value for visible fields that updates when component changes
let visibleFields = $derived(
  currentProperty
    ? Object.entries(fields).filter(([fieldKey, fieldDef]) => {
        const property = $formStore[fieldRoot]?.find((p) => p.id === propertyId);
        return (
          !fieldDef.showForComponent ||
          (fieldDef.showForComponent &&
            fieldDef.showForComponent.includes(
              property?.component as FieldComponentType
            ))
        );
      })
    : []
);

// --- Translation Bar Logic for Property & its Values ---
let loadingLocale = $state<Locale | null>(null);
let isClearAllVisible = $state(true);

let isTranslationDisabled = $derived.by(() => {
  // Explicitly reference reactive dependencies to ensure recalculation
  const _currentProperty = currentProperty;
  const _complexValues = complexValues;

  return {
    en: isTranslationDisabledForLocale('en'),
    'zh-hans': isTranslationDisabledForLocale('zh-hans'),
    'zh-hant': isTranslationDisabledForLocale('zh-hant')
  };
});

// Derived state to check if translation is possible for a given target locale
function isTranslationDisabledForLocale(targetLocale: Locale) {
  if (!currentProperty) return true; // No property, disable translation

  // Check property label for the target locale
  if (
    currentProperty.i18n?.[targetLocale]?.label === undefined ||
    currentProperty.i18n?.[targetLocale]?.label.trim() === ''
  ) {
    return false; // Label is empty, translation is possible
  }
  // Check property placeholder for the target locale
  if (
    currentProperty.i18n?.[targetLocale]?.placeholder === undefined ||
    currentProperty.i18n?.[targetLocale]?.placeholder.trim() === ''
  ) {
    return false; // Placeholder is empty, translation is possible
  }

  // Check all complex values for the target locale if the property has values
  // Use complexValues instead of currentProperty.values for real-time reactivity
  if (complexValues && complexValues.length > 0) {
    for (const cv of complexValues) {
      // Check if the target locale value is empty
      const localeValue = (cv as any)[targetLocale];
      if (!localeValue || localeValue.trim() === '') {
        return false; // Found an empty value field, translation is possible
      }
    }
  }
  // If it's a classifier and currentProperty.values is null (explicitly no values, e.g. for a different kind of classifier)
  // and we've already checked label/placeholder, then translation can be considered disabled if those were filled.
  // The loop above handles cases where `values` is an array (empty or populated).
  // If `values` is `null` for a classifier, and label/placeholder are filled, it means no value-based fields to translate.

  return true; // All relevant fields (label, placeholder, and values if applicable) have content for the target locale
}

async function translatePropertyAndValues(
  event: Event,
  targetLocale: Locale,
  sourceLocale: Locale // TranslationBar should provide this
) {
  event.preventDefault();
  if (!currentProperty) return;

  loadingLocale = sourceLocale;
  try {
    const propI18nTarget = currentProperty.i18n?.[targetLocale];

    const textsToTranslate: string[] = [];
    const textOrigins: Array<{
      type: 'label' | 'placeholder' | 'value';
      valueId?: string;
      originalGenFlag: boolean;
      originalIndex?: number; // To map back translated texts
    }> = [];
    let translationPayloadIndex = 0;

    // 1. Property Label - Translate if target is empty
    if (!propI18nTarget?.label?.trim()) {
      textsToTranslate.push(currentProperty.i18n?.[sourceLocale]?.label || '');
      textOrigins.push({
        type: 'label',
        originalGenFlag: currentProperty.i18n?.[sourceLocale]?.labelGen || false,
        originalIndex: translationPayloadIndex++
      });
    } else {
      textOrigins.push({
        type: 'label',
        originalGenFlag: propI18nTarget.labelGen
      }); // Placeholder for consistent indexing
    }

    // 2. Property Placeholder - Translate if target is empty
    if (!propI18nTarget?.placeholder?.trim()) {
      textsToTranslate.push(currentProperty.i18n?.[sourceLocale]?.placeholder || '');
      textOrigins.push({
        type: 'placeholder',
        originalGenFlag: currentProperty.i18n?.[sourceLocale]?.placeholderGen || false,
        originalIndex: translationPayloadIndex++
      });
    } else {
      textOrigins.push({
        type: 'placeholder',
        originalGenFlag: propI18nTarget.placeholderGen
      }); // Placeholder
    }

    // 3. PropertyValue Values - Translate if target is empty
    const complexValuesToUpdate = complexValues.map((cv, index) => {
      const targetValue = (cv as any)[targetLocale];
      if (!targetValue || targetValue.trim() === '') {
        const sourceValue = (cv as any)[sourceLocale];
        textsToTranslate.push(sourceValue || '');
        const sourceGenFlag = (cv as any)[`${sourceLocale}Gen`];
        textOrigins.push({
          type: 'value',
          valueId: cv.id,
          originalGenFlag: sourceGenFlag || false,
          originalIndex: translationPayloadIndex++
        });
      } else {
        const targetGenFlag = (cv as any)[`${targetLocale}Gen`];
        textOrigins.push({
          type: 'value',
          valueId: cv.id,
          originalGenFlag: targetGenFlag
        }); // Placeholder
      }
      return { ...cv }; // Return a copy
    });

    if (textsToTranslate.length === 0) {
      // console.info('No empty fields to translate for locale:', targetLocale);
      return;
    }

    const response = await fetch('/api/translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: sourceLocale,
        target: targetLocale,
        texts: textsToTranslate
      })
    });

    if (!response.ok) {
      throw new Error(`Translation API request failed: ${response.statusText}`);
    }
    const translatedTexts: string[] = await response.json();

    // Update formStore for Property Label and Placeholder
    formStore.update(($form) => {
      const propToUpdate = $form[fieldRoot]?.find((p) => p.id === propertyId);
      if (!propToUpdate) return $form;
      if (!propToUpdate.i18n) propToUpdate.i18n = {} as any;
      if (propToUpdate.i18n && !propToUpdate.i18n?.[targetLocale as Locale])
        propToUpdate.i18n[targetLocale as Locale] = { locale: targetLocale } as any;

      const labelOrigin = textOrigins.find((o) => o.type === 'label');
      if (
        labelOrigin &&
        labelOrigin.originalIndex !== undefined &&
        translatedTexts[labelOrigin.originalIndex] !== undefined &&
        propToUpdate.i18n &&
        propToUpdate.i18n[targetLocale]
      ) {
        propToUpdate.i18n[targetLocale]!.label =
          translatedTexts[labelOrigin.originalIndex];
        propToUpdate.i18n[targetLocale]!.labelGen = true;
      }

      const placeholderOrigin = textOrigins.find((o) => o.type === 'placeholder');
      if (
        placeholderOrigin &&
        placeholderOrigin.originalIndex !== undefined &&
        translatedTexts[placeholderOrigin.originalIndex] !== undefined &&
        propToUpdate.i18n &&
        propToUpdate.i18n[targetLocale]
      ) {
        propToUpdate.i18n[targetLocale]!.placeholder =
          translatedTexts[placeholderOrigin.originalIndex];
        propToUpdate.i18n[targetLocale]!.placeholderGen = true;
      }
      return $form;
    });

    // Update complexValues for PropertyValue texts
    const newComplexValues = complexValuesToUpdate.map((cv) => {
      const origin = textOrigins.find((o) => o.type === 'value' && o.valueId === cv.id);
      if (
        origin &&
        origin.originalIndex !== undefined &&
        translatedTexts[origin.originalIndex] !== undefined
      ) {
        const updatedCv = { ...cv };
        (updatedCv as any)[targetLocale] = translatedTexts[origin.originalIndex];
        (updatedCv as any)[`${targetLocale}Gen`] = true;
        return updatedCv;
      }
      return cv;
    });
    complexValues = newComplexValues;
    syncComplexValuesToForm(); // Ensure form is updated with new values and ranks
  } catch (err) {
    console.error('Translation error:', err);
    // TODO: Show error to user
  } finally {
    loadingLocale = null;
  }
}

function clearAllValuesForLocale(event: Event, localeToClear: Locale) {
  event.preventDefault();
  if (!currentProperty) return;
  loadingLocale = localeToClear; // Set loading for the specific locale being cleared

  try {
    // Clear Property Label and Placeholder
    formStore.update(($form) => {
      const propToUpdate = $form[fieldRoot]?.find((p) => p.id === propertyId);
      if (!propToUpdate) return $form;

      if (propToUpdate.i18n?.[localeToClear]) {
        propToUpdate.i18n[localeToClear]!.label = '';
        propToUpdate.i18n[localeToClear]!.labelGen = false;
        propToUpdate.i18n[localeToClear]!.placeholder = '';
        propToUpdate.i18n[localeToClear]!.placeholderGen = false;
      }
      return $form;
    });

    // Clear PropertyValue values
    complexValues = complexValues.map((cv) => {
      const updatedCv = { ...cv };
      (updatedCv as any)[localeToClear] = '';
      (updatedCv as any)[`${localeToClear}Gen`] = false;
      return updatedCv;
    });
    syncComplexValuesToForm();
  } catch (err) {
    console.error('Error clearing values for locale:', localeToClear, err);
  } finally {
    loadingLocale = null; // Clear loading state
  }
}

// --- End Translation Bar Logic ---

const currentPropertyType = $derived(currentProperty?.type);
const isSpecifier = $derived(currentPropertyType === 'specifier');

const allI18nErrorsForPropertyValues = $derived.by(() => {
  const propIndex = $formStore[fieldRoot]?.findIndex((p) => p.id === propertyId);
  const propertyValuesErrors = $errorsStore[fieldRoot]?.[propIndex as number]?.values;
  let collectedMessages: string[] = [];
  if (
    propertyValuesErrors &&
    typeof propertyValuesErrors === 'object' &&
    propertyValuesErrors !== null
  ) {
    Object.values(propertyValuesErrors).forEach((valueError: any) => {
      if (valueError?.i18n?._errors && Array.isArray(valueError.i18n._errors)) {
        collectedMessages.push(...valueError.i18n._errors);
      }
    });
  }
  return [...new Set(collectedMessages)];
});
</script>

{#if currentProperty}
  <div
    class="relative mt-8 flex w-auto select-none items-baseline justify-center gap-2 {collapsed
      ? 'mb-4'
      : 'mb-0'}">
    <h2
      class="flex cursor-pointer items-center justify-between gap-4 rounded-lg border-3 border-primary bg-glass-result p-2 pl-4 text-center text-xl font-bold"
      onclick={() => (collapsed = !collapsed)}>
      <span>
        {propertyTitle}
      </span>
      {#if isSpecifier}
        <label
          for="isTranslatable"
          class="flex items-center gap-3"
          title={m.frail_grand_finch_heart()}
          onclick={(e) => {
            e.stopPropagation();
          }}>
          <Icon
            src={LanguageIcon}
            class="h-5 w-5 translate-x-1 stroke-[2px] text-neutral-content" />
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-xs translate-y-[1px]"
            bind:checked={currentProperty.isTranslatable} />
        </label>
      {/if}
      <span class="flex items-center gap-1">
        <button
          class="btn btn-square btn-ghost btn-xs"
          title={m.rank__increase()}
          disabled={currentProperty.rank === 0}
          onclick={(e) => {
            e.stopPropagation();
            actions.increaseRank(e, propertyId!);
          }}>
          <Icon src={ArrowUp} class="h-4 w-4 stroke-[3px]" />
        </button>
        <button
          class="btn btn-square btn-ghost btn-xs"
          title={m.rank__decrease()}
          disabled={currentProperty.rank === totalItemsOfThisType - 1}
          onclick={(e) => {
            e.stopPropagation();
            actions.decreaseRank(e, propertyId!);
          }}>
          <Icon src={ArrowDown} class="h-4 w-4 stroke-[3px]" />
        </button>
      </span>
    </h2>
  </div>
  {#if !collapsed}
    <div
      transition:slide
      class="relative my-6 mb-0 grid min-h-32 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#if removeMode && !isConfirming(propertyId ?? '')}
        <RemoveShim
          onclick={() => {
            confirmationMode = true;
            confirmingId = propertyId;
          }} />
      {/if}

      {#if isConfirming(propertyId ?? '')}
        <ConfirmShim
          onCancel={() => resetModes(false)}
          onAccept={(e: Event) => {
            actions.remove(e, propertyId);
            resetModes();
          }} />
      {/if}

      {#each supportedLocales as locale, colIndex (locale)}
        <div
          class="bg-grain group relative flex flex-grow flex-col gap-4 rounded-xl border-3 border-primary bg-glass-300 pb-[78px] {complexActionProps.dragMode
            ? 'drag-mode'
            : ''}">
          <div
            class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4">
            {#each visibleFields as [fieldKey, fieldDef], propIndex (`${fieldKey}-${$formStore[fieldRoot]?.find((p) => p.id === propertyId)?.component || 'default'}`)}
              {@const FieldComponent = getFieldComponent(fieldDef.component)}
              {@const isListField = fieldDef.component === 'ListField'}
              {@const shouldShowField =
                fieldDef.isTranslated ||
                isNotLocale(locale) ||
                (!fieldDef.isTranslated && colIndex === 0)}
              {#if FieldComponent && shouldShowField}
                <FieldComponent
                  {...{
                    ...(fieldProps as any),
                    searchMode,
                    removeMode,
                    confirmationMode,
                    confirmingId,
                    locale,
                    fieldKey,
                    field: fieldDef,
                    ...(isListField && {
                      values: complexValues,
                      actions: complexActions,
                      actionProps: complexActionProps
                    })
                  }} />
              {:else if FieldComponent}
                <FauxInput />
              {/if}
            {/each}
            {#if allI18nErrorsForPropertyValues.length > 0}
              <div class="mt-2 w-full rounded-lg bg-error/10 p-3 text-sm text-error">
                <ul class="list-disc pl-5">
                  {#each allI18nErrorsForPropertyValues as errorMsg}
                    <li>{errorMsg}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
          <TranslationBar
            targetLocale={locale}
            isTranslationDisabled={(isTranslationDisabled as any)[locale]}
            onTranslate={(e: Event, sourceLocaleFromBar: Locale) =>
              translatePropertyAndValues(e, locale, sourceLocaleFromBar)}
            onClear={(e: Event) => clearAllValuesForLocale(e, locale)}
            {isClearAllVisible}
            bind:loadingLocale
            form={fieldProps.form}
            fields={fieldProps.fields as any} />
        </div>
      {/each}
    </div>
  {/if}
{/if}
