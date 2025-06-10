import { loadFormData } from '$lib/api';
import { 
  OrganisationInsertAPI, 
  OrganisationUpdateAPI,
  OrganisationInsertSuperAdminAPI,
  OrganisationUpdateSuperAdminAPI 
} from '$lib/db/zod';
// ENUMS
import { ResourcePath } from '$lib/enums';
// TYPES
import type { PageLoad } from './$types';
import type { Organisation } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, data }) => {
  const isSuperAdmin = data?.user?.superAdmin || false;
  
  return await loadFormData<Organisation>({
    entity: params.organisation,
    resourcePath:  ResourcePath.organisation,
    insertSchema: isSuperAdmin ? OrganisationInsertSuperAdminAPI : OrganisationInsertAPI,
    updateSchema: isSuperAdmin ? OrganisationUpdateSuperAdminAPI : OrganisationUpdateAPI,
    fetch
  });
};
