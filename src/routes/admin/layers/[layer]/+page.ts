import { loadFormData } from '$lib/api';
import { LayerInsertAPI, LayerUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Layer } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  return loadFormData<Layer>({
    entity: params.layer,
    resourcePath: 'layers',
    insertSchema: LayerInsertAPI,
    updateSchema: LayerUpdateAPI,
    fetch
  });
};
