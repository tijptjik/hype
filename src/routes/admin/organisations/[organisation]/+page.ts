import { loadFormData } from '$lib/api';
import { OrganisationInsertAPI, OrganisationUpdateAPI } from '$lib/db/zod';
// TYPES
import type { PageLoad } from './$types';
import type { Organisation } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, data }) => {
  return await loadFormData<Organisation>({
    entity: params.organisation,
    resourcePath: 'organisations',
    insertSchema: OrganisationInsertAPI,
    updateSchema: OrganisationUpdateAPI,
    fetch,
    session: data?.session ?? undefined
  });
};
