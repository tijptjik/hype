import { loadFormData } from '$lib/api';
import { FeatureInsertAPI, FeatureUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Feature } from '$lib/types';
import { ResourcePath } from '$lib/enums';

export const load: PageLoad = async ({ params, fetch, url }) => {
  return loadFormData<Feature>({
    entity: params.feature,
    resourcePath: ResourcePath.feature,
    insertSchema: FeatureInsertAPI,
    updateSchema: FeatureUpdateAPI,
    fetch,
    parentId: url.searchParams.get('parentId') || undefined,
    parentRef: url.searchParams.get('parentRef') || undefined
  });
};
