import { defaults, superForm, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  ProjectSchema,
  project,
  projectI18n,
  ProjectI18n
} from '$lib/db/schema';
import { getSessionOrError, JSONResponseOrError } from '$lib/api';
import client from '$lib/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { actionResult } from 'sveltekit-superforms';

// Infer the type of ProjectSchema
type ProjectType = z.infer<typeof ProjectSchema>;
type ProjectI18nType = z.infer<typeof ProjectI18n>;

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  // AUTH : Pass or Fail
  await getSessionOrError(locals);
  // DB : Connect to D1
  const db = client(platform?.env.DB);
  try {
    // DB : Build & Execute Query
    // @ts-ignore
    console.info('Searching for', params.code);
    const result = await db.query.project.findFirst({
      // @ts-ignore
      where: eq(project.code, params.code),
      with: {
        translations: true
      }
    });

    // HTTP : 200 JSON or 404
    // Always return { form }
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
    const translations: ProjectI18nType[] = formData.translations;

    delete formData.translations;

    const updatedProject = await db
      .update(project)
      .set({ ...formData })
      // @ts-ignore
      .where(eq(project.code, params.code))
      .returning();

    if (updatedProject.length === 0) {
      return error(404, 'Project not found');
    }

    const modifiedTranslations = [];

    for (const translation of translations) {
      const existingTranslation = await db.query.projectI18n.findFirst({
        where: and(
          eq(projectI18n.projectId, translation.projectId),
          eq(projectI18n.lang, translation.lang)
        )
      });

      if (existingTranslation) {
        const updatedTranslation = await db
          .update(projectI18n)
          .set(translation)
          .where(
            and(
              eq(projectI18n.projectId, translation.projectId),
              eq(projectI18n.lang, translation.lang)
            )
          )
          .returning();
        modifiedTranslations.push(updatedTranslation[0]);
      } else {
        const insertedTranslation = await db
          .insert(projectI18n)
          .values(translation)
          .returning();
        modifiedTranslations.push(insertedTranslation[0]);
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
