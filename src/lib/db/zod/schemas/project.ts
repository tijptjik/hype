// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '$lib/db/schema';
// CONSTRAINTS
import { getDefaultConstraints, getLocales, getMaintainerRoles } from '../constraints';
// ZOD SCHEMAS
import { UserBasic } from './user';
import { PropertyAPI, PropertyInsertAPI, PropertyUpdateAPI } from './property';
import { ImageBasic, ImageBase } from './image';
import { OrganisationI18nBase } from './organisation';
import { OrganisationBase } from './organisation';

/* ----------------- */
// PROJECT CORE SCHEMAS
/* -------- */

export const ProjectBase = createSelectSchema(project);
export const ProjectInsert = createInsertSchema(project).extend({
  ...getDefaultConstraints(project),
});
export const ProjectUpdate = createUpdateSchema(project).extend({
  ...getDefaultConstraints(project)
});

/* ----------------- */
// PROJECT RELATIONAL SCHEMAS
/* -------- */

export const ProjectI18nBase = createSelectSchema(projectI18n);
export const ProjectI18nInsert = createInsertSchema(projectI18n)
  .extend({
    ...getDefaultConstraints(projectI18n)
  })
  .omit({
    projectId: true
  });
export const ProjectI18nUpdate = createUpdateSchema(projectI18n).extend({
  ...getDefaultConstraints(projectI18n)
});

export const ProjectRoleBase = createSelectSchema(projectRole);
export const ProjectRoleBaseExtra = ProjectRoleBase.extend({
  i18n: z.array(ProjectI18nBase).nullish(),
  user: UserBasic
});
export const ProjectRoleInsert = createInsertSchema(projectRole).omit({
  projectId: true
});
export const ProjectRoleInsertExtra = ProjectRoleInsert.extend({
  role: z.enum(['maintainer', 'member']),
  user: UserBasic
});
export const ProjectRoleUpdate = createUpdateSchema(projectRole);
export const ProjectRoleUpdateExtra = ProjectRoleUpdate.extend({
  role: z.enum(['maintainer', 'member']),
  user: UserBasic
});

export const ProjectRoleAPI = ProjectRoleBase.extend({
  project: ProjectBase.extend({
    i18n: getLocales(ProjectI18nBase),
    organisation: OrganisationBase.extend({
      i18n: getLocales(OrganisationI18nBase)
    })
  })
});

export const ProjectRoleWithUser = ProjectRoleBase.extend({
  user: UserBasic
});

/* ----------------- */
// PROJECT API SCHEMAS
/* -------- */

export const ProjectCollectionAPI = ProjectBase.extend({
  i18n: getLocales(ProjectI18nBase),
  image: ImageBasic.nullish()
});

export const ProjectAPI = ProjectBase.extend({
  i18n: getLocales(ProjectI18nBase),
  maintainerRoles: getMaintainerRoles(ProjectRoleBaseExtra),
  properties: z.array(PropertyAPI).nullish(),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish(),
});

export const ProjectInsertAPI = ProjectInsert.extend({
  i18n: getLocales(ProjectI18nInsert),
  maintainerRoles: getMaintainerRoles(ProjectRoleInsertExtra),
  properties: z.array(PropertyInsertAPI).nullish(),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish()
});

export const ProjectUpdateAPI = ProjectUpdate.extend({
  i18n: getLocales(ProjectI18nUpdate),
  maintainerRoles: getMaintainerRoles(ProjectRoleUpdateExtra),
  properties: z.array(PropertyUpdateAPI).nullish(),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish()
});

/* ----------------- */
// PROJECT INTERMEDIATE SCHEMAS
/* -------- */

export const ProjectDBRaw = ProjectBase.extend({
  i18n: z.array(ProjectI18nBase),
  maintainerRoles: z.array(ProjectRoleBaseExtra),
  properties: z.array(PropertyAPI),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish()
});