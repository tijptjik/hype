import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, type RequestHandler } from '@sveltejs/kit';
import { ProjectSchema, project, projectI18n, ProjectI18n, projectRole } from '$lib/db/schema';
import { getDatabaseOrError, getSessionOrError, JSONResponseOrError } from '$lib/api';
import client, { genericEntityQuery } from '$lib/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { actionResult } from 'sveltekit-superforms';
import { type AccessStrategyOption } from '$lib/api';

// Infer the type of ProjectSchema
type ProjectType = z.infer<typeof ProjectSchema>;
type ProjectI18nType = z.infer<typeof ProjectI18n>;

const RESOURCE_TYPE = 'project';
const ACCESS_STRATEGY = 'EntityOwn' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'code';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );
  try {
    // DB : Build & Execute Query
    const result = await genericEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        translations: true,
        maintainerRoles: true
      },
      userId,
      projectRole,
      projectI18n,
      2
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(result);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // AUTH : Pass or Fail
  await getSessionOrError(locals);
  // DB : Connect to D1
  const db = client(platform?.env.DB);
  try {
    const formData: ProjectType = await request.json();
    const translations: ProjectI18nType[] = formData.translations || [];

    delete formData.translations;

    const [updatedProject] = await db
      .update(project)
      .set({ ...formData })
      // @ts-ignore
      .where(eq(project.code, params.code))
      .returning();

    if (!updatedProject) {
      return error(404, 'Project not found');
    }

    const modifiedTranslations = [];

    for (const translation of translations) {
      const [existingTranslation] = await db.query.projectI18n.findFirst({
        where: and(
          eq(projectI18n.projectId, translation.projectId),
          eq(projectI18n.lang, translation.lang)
        )
      });

      if (existingTranslation) {
        const [updatedTranslation] = await db
          .update(projectI18n)
          .set(translation)
          .where(
            and(
              eq(projectI18n.projectId, translation.projectId),
              eq(projectI18n.lang, translation.lang)
            )
          )
          .returning();
        modifiedTranslations.push(updatedTranslation);
      } else {
        const [insertedTranslation] = await db.insert(projectI18n).values(translation).returning();
        modifiedTranslations.push(insertedTranslation);
      }
    }

    const rebuildForm = await superValidate(
      {
        ...updatedProject,
        translations: modifiedTranslations
      },
      zod(ProjectSchema)
    );

    console.debug('rebuildForm', rebuildForm);

    return actionResult('success', rebuildForm, 200);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to update project');
  }
};
