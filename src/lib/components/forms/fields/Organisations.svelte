<script lang="ts">
// SVELTE
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// TYPES
import type { Organisation, ImageDB } from '$lib/types';

// STATE : PROPS
let {
  fieldRoot,
  joinConfig,
  searchMode = $bindable(false),
  removeMode = $bindable(false),
  ...fieldProps
}: {
  fieldRoot: string;
  joinConfig: any;
  searchMode?: boolean;
  removeMode?: boolean;
  form: any;
} = $props();

// STATE : CONTEXT :: FORM
let hubForm = $derived(fieldProps.form.form);

// Ensure i18n is in Record format expected by schema
const ensureI18nRecordFormat = (i18nData: any) => {
  if (!i18nData) return null;
  if (!Array.isArray(i18nData)) return i18nData; // Already in Record format

  return i18nData.reduce((acc: any, bundle: any) => {
    acc[bundle.locale] = bundle;
    return acc;
  }, {});
};

const updateOrganisationCoreInclusive = (
  organisationId: string,
  isCoreInclusive: boolean
) => {
  hubForm.update(($form: any) => {
    const organisations = [...($form.organisations || [])];
    const orgIndex = organisations.findIndex((org: any) => org.id === organisationId);
    if (orgIndex !== -1) {
      organisations[orgIndex] = {
        ...organisations[orgIndex],
        isCoreInclusive
      };
    }

    // Ensure all organisations have i18n in Record format
    const normalizedOrganisations = organisations.map((org) => ({
      ...org,
      i18n: ensureI18nRecordFormat(org.i18n)
    }));

    return { ...$form, organisations: normalizedOrganisations };
  });
};

const removeOrganisation = async (e: Event, organisationId: string) => {
  e.preventDefault();

  hubForm.update(($form: any) => {
    const organisations = [...($form.organisations || [])];

    const updatedOrganisations = organisations.filter((org: any) => {
      if (!org || !org.id) {
        return false; // Remove invalid entries
      }
      return org.id !== organisationId;
    });

    // Ensure all remaining organisations have i18n in Record format and are valid
    const normalizedOrganisations = updatedOrganisations
      .filter((org: any) => org && org.id) // Extra safety check
      .map((org: any) => ({
        ...org,
        i18n: ensureI18nRecordFormat(org.i18n)
      }));

    $form.organisations = normalizedOrganisations;

    return $form;
  });

  try {
    await fieldProps.form.validate('organisations' as any);
  } catch (error) {
    console.warn('Validation error:', error);
  }
};

// Access form value directly
let organisations = $derived(($hubForm as any).organisations || ([] as Organisation[]));

// Update modes based on organisations length
$effect(() => {
  if (organisations.length === 0 && removeMode) {
    removeMode = false;
    searchMode = true;
  }
});
</script>

<div class="grid grid-cols-1 gap-4 p-4 2xl:grid-cols-2">
  {#each organisations.sort((a: Organisation, b: Organisation) => (a.i18n?.en?.name || a.code)?.localeCompare(b.i18n?.en?.name || b.code) ?? 0) as organisation, index (organisation.id)}
    <div class="grid-span-1 group" in:scale out:scale animate:flip={{ duration: 200 }}>
      <div
        class="card card-side relative h-full flex-row items-center overflow-hidden rounded-l-xl bg-base-100 pr-6 shadow-xl">
        {#if removeMode}
          <div
            class="absolute left-0 top-0 flex w-24 items-center justify-center opacity-80">
            <button
              onclick={(e) => removeOrganisation(e, organisation.id)}
              class="btn btn-ghost h-24 w-24 rounded-none bg-base-200">
              <Icon src={Trash} class="h-6 w-6" />
            </button>
          </div>
        {/if}
        <figure class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-l-xl md:block">
          <img
            src={getURLfromImage({
              image: organisation.image as ImageDB,
              transformation: 'c_fill,h_100,w_100,q_auto'
            })}
            class="h-24 w-24 object-cover" />
        </figure>
        <div class="card-body flex-auto py-0">
          <p
            class="card-title flex flex-col items-start justify-start gap-1 text-lg font-normal">
            <span class="text-xs text-gray-500">
              {organisation.code}
            </span>
            <span>{organisation.i18n?.en?.name || organisation.code}</span>
          </p>
        </div>
        <label
          class="label flex flex-shrink-0 flex-grow-0 flex-col items-center gap-2 pb-2 text-sm"
          style="font-variant: small-caps; font-variant-caps: small-caps;">
          {m.acidic_maroon_buzzard_swim()}
          <input
            name={organisation.id}
            type="checkbox"
            data-testid={`organisationCheckbox_${index}`}
            class="checkbox-primary checkbox checkbox-lg"
            checked={(organisation as any).isCoreInclusive === true}
            onchange={(e) =>
              updateOrganisationCoreInclusive(
                organisation.id,
                e.currentTarget.checked
              )} />
        </label>
      </div>
    </div>
  {/each}
</div>
