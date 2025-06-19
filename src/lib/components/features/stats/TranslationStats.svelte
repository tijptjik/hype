<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import {
  calculateTranslationCompletionTriState,
  getCachedFeatureTranslationTriState,
  getCachedFeatureSpecifierTranslation,
  calculateSpecifierTranslation
} from '$lib/client/services/stats';
// ICONS
import { Language } from '@steeze-ui/heroicons';
// I18N
import { getLocale } from '$lib/i18n';
// TYPES
import type { Feature } from '$lib/types';
import type { AppCtx } from '$lib/context/app.svelte';

let {
  feature,
  appCtx,
  showTitle = true
}: {
  feature: Feature;
  appCtx: AppCtx;
  showTitle?: boolean;
} = $props();

const currentLocale = $derived(getLocale());

// Helper function to create translation tooltip
function getTranslationTooltip(fieldName: string, status: boolean | null): string {
  if (status === true) return `${fieldName} Translated`;
  if (status === false) return `${fieldName} Not Translated`;
  return `${fieldName} Not Available`;
}

const statuses = $derived.by(() => {
  const titleStatus = getCachedFeatureTranslationTriState(
    appCtx,
    feature,
    'isTitleTranslated',
    currentLocale,
    (f, locale) => calculateTranslationCompletionTriState(appCtx, f, locale).title
  );
  const descriptionStatus = getCachedFeatureTranslationTriState(
    appCtx,
    feature,
    'isDescriptionTranslated',
    currentLocale,
    (f, locale) => calculateTranslationCompletionTriState(appCtx, f, locale).description
  );
  const addressStatus = getCachedFeatureTranslationTriState(
    appCtx,
    feature,
    'isAddressTranslated',
    currentLocale,
    (f, locale) =>
      calculateTranslationCompletionTriState(appCtx, f, locale).displayAddress
  );

  const result = {
    [getTranslationTooltip('Title', titleStatus)]: titleStatus,
    [getTranslationTooltip('Description', descriptionStatus)]: descriptionStatus,
    [getTranslationTooltip('Address', addressStatus)]: addressStatus
  };

  // TODO: Implement translatable specifiers - currently just shows global translation status
  // Add property translation status for admin users only (now tri-state)
  if (appCtx.user?.superAdmin) {
    const propertyStatus = getCachedFeatureSpecifierTranslation(appCtx, feature, (f) =>
      calculateSpecifierTranslation(f)
    );
    result[getTranslationTooltip('Properties', propertyStatus)] = propertyStatus;
  }

  return result;
});
</script>

<ProgressPips title="TRANSLATION" icon={Language} {statuses} {showTitle} />
