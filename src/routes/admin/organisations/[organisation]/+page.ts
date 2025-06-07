import { loadFormData } from '$lib/api';
import { 
  OrganisationInsertAPI, 
  OrganisationUpdateAPI,
  OrganisationInsertSuperAdminAPI,
  OrganisationUpdateSuperAdminAPI 
} from '$lib/db/zod';
// TYPES
import type { PageLoad } from './$types';
import type { Organisation } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, data }) => {
  const isSuperAdmin = data?.session?.user?.superAdmin || false;
  
  return await loadFormData<Organisation>({
    entity: params.organisation,
    resourcePath: 'organisations',
    insertSchema: isSuperAdmin ? OrganisationInsertSuperAdminAPI : OrganisationInsertAPI,
    updateSchema: isSuperAdmin ? OrganisationUpdateSuperAdminAPI : OrganisationUpdateAPI,
    fetch,
    session: data?.session ?? undefined
  });
};
