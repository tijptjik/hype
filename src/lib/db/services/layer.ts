import type { NewLayerDB, LayerDB, TargetLang, NewLayerI18n, LayerI18n, Id, NewLayer, Layer, LayerI18nDB } from '$lib/types';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { layer, layerI18n } from '../schema';
import { LayerInsert, LayerUpdate, LayerUpdateAPI } from '../zod';

export type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;

// CREATE / UPDATE

export const createLayer = async (db: Database, data: NewLayerDB) => {
  const [insertedLayer] = await db
    .insert(layer)
    .values({ ...data })
    .returning();

  if (!insertedLayer) {
    return error(404, 'Layer has stepped through the looking glass');
  }

  return insertedLayer;
};

export const updateLayer = async (db: Database, data: LayerDB, ref: string) => {
  const [updatedLayer] = await db
    .update(layer)
    .set({ ...data })
    .where(eq(layer.id, ref))
    .returning();

  if (!updatedLayer) {
    return error(404, 'Layer has stepped through the looking glass');
  }

  return updatedLayer;
};

export const createTranslations = async (
  db: Database,
  translations: Record<TargetLang, NewLayerI18n>,
  layerId: string
) => {
  const translationsToInsert = Object.entries(translations).map(([lang, translation]) => ({
    ...translation,
    layerId,
    lang: lang as 'zh-hant' | 'zh-hans'
  }));

  return await db.insert(layerI18n).values(translationsToInsert).returning();
};

export const updateTranslations = async (
  db: Database,
  translations: Record<TargetLang, LayerI18n>,
  layerId: string
) => {
  await db.delete(layerI18n).where(eq(layerI18n.layerId, layerId));
  return await createTranslations(db, translations, layerId);
};

// UTILS

export const extractEntitiesToInsert = (formData: NewLayer) => {
  let baseLayer = LayerInsert.parse(formData);
  let formTranslations: Record<TargetLang, NewLayerI18n> = formData.translations;
  return { baseLayer, formTranslations };
};

export const extractEntitiesToUpdate = (formData: Layer) => {
  let baseLayer = LayerUpdate.parse(formData);
  let formTranslations: Record<TargetLang, LayerI18n> = formData.translations;
  return { baseLayer, formTranslations };
};

export const rebuildFormData = async (
  layer: LayerDB,
  translations: LayerI18n[]
) => {
  const formTranslations = translations.reduce(
    (acc: Record<string, Record<string, any>>, translation: Record<string, any>) => {
      const { lang, ...translationWithoutLang } = translation;
      acc[lang] = translationWithoutLang;
      return acc;
    },
    {}
  ) as Record<TargetLang, LayerI18n>;

  return await superValidate(
    {
      ...layer,
      translations: formTranslations
    },
    zod(LayerUpdateAPI)
  );
};

