import { loadFormData } from '$lib/api';
import { OrganisationInsertAPI, OrganisationUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Organisation } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  return loadFormData<Organisation>({
    entity: params.organisation,
    resourcePath: 'organisations',
    insertSchema: OrganisationInsertAPI,
    updateSchema: OrganisationUpdateAPI,
    fetch
  });
};
