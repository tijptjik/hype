<script lang="ts">
import { customAlphabet } from 'nanoid';
import { getFieldComponent, isPrimaryLang, languageTags} from '$lib';
// COMPONENTS
import RemoveShim from '$lib/components/forms/shims/Remove.svelte';
import ConfirmShim from '$lib/components/forms/shims/Confirm.svelte';
import FauxInput from '$lib/components/forms/fields/FauxInput.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type {
  FieldProps,
  FormProps,
  ActionProps,
  FacetRouter
} from '$lib/types';

// STATE : INTERMEDIATE VALUES
type IntermediateValue = {
  id: string;
  rank: number;
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

// STATE : PROPS
let {
  actionProps = $bindable({
    searchMode: false,
    removeMode: false,
    confirmationMode: false,
    confirmingId: undefined
  }),
  ...fieldProps
}: FieldProps & ActionProps = $props();
let { fieldRoot, fieldIndex, fields, actions } = fieldProps;

// STATE : FORM
let { form } = fieldProps.form;

// STATE : INTERMEDIATE VALUES
let complexValues: IntermediateValue[] = $state([]);

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as FacetRouter;

// Sync Form to Complex Values
const syncFormToComplexValues = () => {
  complexValues = $form[fieldRoot][fieldIndex].values
    .map((v) => ({
      id: v.id,
      rank: v.rank,
      en: v.value,
      enGen: v.valueGen,
      'zh-hans': v.translations['zh-hans'].value,
      'zh-hansGen': v.translations['zh-hans'].valueGen,
      'zh-hant': v.translations['zh-hant'].value,
      'zh-hantGen': v.translations['zh-hant'].valueGen
    }))
    .sort((a, b) => a.rank - b.rank);
};

// Sync Complex Values to Form
const syncComplexValuesToForm = () => {
  form.update(($form) => {
    let propertyId = $form[fieldRoot][fieldIndex].id;
    $form[fieldRoot][fieldIndex].values = complexValues.map((v) => ({
      id: v.id,
      propertyId: propertyId,
      value: v.en,
      valueGen: v.enGen,
      rank: v.rank,
      translations: {
        'zh-hant': {
          propertyValueId: v.id,
          lang: 'zh-hant',
          value: v['zh-hant'],
          valueGen: v['zh-hantGen']
        },
        'zh-hans': {
          propertyValueId: v.id,
          lang: 'zh-hans',
          value: v['zh-hans'],
          valueGen: v['zh-hansGen']
        }
      }
    }));

    return $form;
  });
};

syncFormToComplexValues();

// Add helper function to reset modes
function resetModes() {
  actionProps.removeMode = false;
  actionProps.confirmationMode = false;
  actionProps.confirmingId = undefined;
}

// Add helper to check if current item is being confirmed
function isConfirming(itemId: string) {
  return actionProps.confirmationMode && actionProps.confirmingId === itemId;
}

// COMPLEX ACTIONS
const updateValue = (valueId: string, languageTag: string, e: Event) => {
  e.preventDefault();
  complexValues.find((v) => v.id === valueId)[languageTag] = e.target.innerText;
  syncComplexValuesToForm();
};

const addValue = (e: Event) => {
  e.preventDefault();
  const id = nanoid();
  complexValues.push({
    id: nanoid(12),
    rank: complexValues.length + 1,
    en: '',
    enGen: false,
    'zh-hans': '',
    'zh-hansGen': false,
    'zh-hant': '',
    'zh-hantGen': false
  });
  syncComplexValuesToForm();
};

const removeValue = (e: Event, valueId: string) => {
  e.preventDefault();
  complexValues = complexValues.filter((v) => v.id !== valueId);
  syncComplexValuesToForm();
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
  removeModeLang: undefined,
  confirmingId: undefined
});

const isVisible = (field: Field) => {
  return (
    !field.showForComponent ||
    (field.showForComponent &&
      field.showForComponent.includes($form[fieldRoot][fieldIndex].component as string))
  );
};
</script>

<div class="relative mx-auto w-32 rounded-lg bg-base-100">
  <h2 class="mt-4 py-2 text-center text-xl font-bold">
    {$form[fieldRoot][fieldIndex].label}
  </h2>
</div>
<div
  class="relative my-4 grid min-h-32 grid-cols-1 gap-4 bg-base-100 bg-opacity-30 p-4 sm:grid-cols-2 xl:grid-cols-3">
  {#if actionProps.removeMode && !isConfirming($form[fieldRoot][fieldIndex].id)}
    <RemoveShim
      onclick={() => {
        actionProps.confirmationMode = true;
        actionProps.confirmingId = $form[fieldRoot][fieldIndex].id;
      }} />
  {/if}

  {#if isConfirming($form[fieldRoot][fieldIndex].id)}
    <ConfirmShim
      onCancel={resetModes}
      onAccept={(e) => {
        actions.remove(e, fieldIndex);
        resetModes();
      }} />
  {/if}

  {#each languageTags as languageTag}
    <div
      class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100 {complexActionProps.dragMode
        ? 'drag-mode'
        : ''}">
      <div class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-6 pt-4">
        {#each Object.entries(fields) as [fieldKey, field], propIndex (fieldKey)}
          {@const Field = getFieldComponent(field.component)}
          {#if isVisible(field) && field.component === 'ListField'}
            <Field
              {...fieldProps}
              {languageTag}
              {fieldKey}
              {field}
              values={complexValues}
              actions={complexActions}
              actionProps={complexActionProps} />
          {:else if isVisible(field)}
            {#if field.isTranslated || isPrimaryLang(languageTag)}
              <Field {...fieldProps} {languageTag} {fieldKey} {field} />
            {:else}
              <FauxInput />
            {/if}
          {/if}
        {/each}
      </div>
      <!-- TODO: Add support for the translation bar -->
      <!-- <div
        class="h-2 w-full transition-[height] delay-1500 duration-300 {!complexActionProps.dragMode && 'group-focus-within:h-0 group-hover:h-0'}">
      </div> -->
      <!-- <div
        class="ease-in-quad max-h-0 overflow-hidden transition-[max-height] delay-1500 duration-300 group-focus-within.drag-mode:max-h-0 group-hover.drag-mode:max-h-0 group-focus-within:max-h-32 group-hover:max-h-32">
        <TranslationBar {languageTag} {...formProps} {...sectionProps} />
      </div> -->
    </div>
  {/each}
</div>
