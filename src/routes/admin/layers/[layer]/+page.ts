import { loadFormData } from '$lib/api';
import { LayerInsertAPI, LayerUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Layer } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, url }) => {
  return loadFormData<Layer>({
    entity: params.layer,
    resourcePath: 'layers',
    insertSchema: LayerInsertAPI,
    updateSchema: LayerUpdateAPI,
    fetch,
    parentId: url.searchParams.get('parentId') || undefined,
    parentRef: url.searchParams.get('parentRef') || undefined
  });
};
