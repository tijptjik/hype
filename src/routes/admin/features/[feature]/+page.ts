import { loadFormData } from '$lib/api';
import { FeatureInsertAPI, FeatureUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Feature } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  return loadFormData<Feature>({
    entity: params.feature,
    resourcePath: 'features',
    insertSchema: FeatureInsertAPI,
    updateSchema: FeatureUpdateAPI,
    fetch
  });
};
