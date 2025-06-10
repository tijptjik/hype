// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod';
// DRIZZLE SCHEMA
import { property, propertyI18n, propertyValue, propertyValueI18n } from '$lib/db/schema/index';
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints';

/* ----------------- */
// PROPERTY CORE SCHEMAS
/* -------- */

export const PropertyBase = createSelectSchema(property);
export const PropertyInsert = createInsertSchema(property).extend({
    ...getDefaultConstraints(property)
});
export const PropertyUpdate = createUpdateSchema(property).extend({
    ...getDefaultConstraints(property)
});

/* ----------------- */
// PROPERTY VALUE SCHEMAS
/* -------- */

export const PropertyValueBase = createSelectSchema(propertyValue);
export const PropertyValueInsert = createInsertSchema(propertyValue);
export const PropertyValueUpdate = createUpdateSchema(propertyValue);


/* ----------------- */
// PROPERTY RELATIONAL SCHEMAS
/* -------- */

export const PropertyI18nBase = createSelectSchema(propertyI18n);
export const PropertyI18nInsert = createInsertSchema(propertyI18n).extend({
    ...getDefaultConstraints(propertyI18n)
});
export const PropertyI18nUpdate = createUpdateSchema(propertyI18n).extend({
    ...getDefaultConstraints(propertyI18n)
});

export const PropertyValueI18nBase = createSelectSchema(propertyValueI18n);
export const PropertyValueI18nInsert = createInsertSchema(propertyValueI18n);
export const PropertyValueI18nUpdate = createUpdateSchema(propertyValueI18n);

/* ----------------- */
// PROPERTY API SCHEMAS
/* -------- */

export const PropertyValueAPI = PropertyValueBase.extend({
  i18n: getLocales(PropertyValueI18nBase)
});

export const PropertyValueInsertAPI = PropertyValueInsert.extend({
  i18n: getLocales(PropertyValueI18nInsert)
})

export const PropertyValueUpdateAPI = PropertyValueUpdate.extend({
  i18n: getLocales(PropertyValueI18nUpdate)
});


export const PropertyAPI = PropertyBase.extend({
  i18n: getLocales(PropertyI18nBase),
  values: z.array(PropertyValueAPI).nullish()
});

export const PropertyInsertAPI = PropertyInsert.extend({
  i18n: getLocales(PropertyI18nInsert),
  values: z.array(PropertyValueInsertAPI)
});

export const PropertyUpdateAPI = PropertyUpdate.extend({
  i18n: getLocales(PropertyI18nUpdate),
  values: z.array(PropertyValueUpdateAPI)
}); 

// INTERMEDIATE

export const PropertyBaseRaw = PropertyBase.extend({
  i18n: z.array(PropertyI18nBase),
  values: z.array(
    PropertyValueBase.extend({
      i18n: z.array(PropertyValueI18nBase).nullish()
    })
  )
});

// TODO Remove once we've migrated to the new schemas

/* ----------------- */
// DEPRECATED PROPERTY VALUES
/* -------- */

// // Property Value Schemas
// export const PropertyValueBase = createSelectSchema(propertyValue);
// export const PropertyValueI18nBase = createSelectSchema(propertyValueI18n);

// // Base schema to validate submit data
// export const PropertyValueInsert = createInsertSchema(propertyValue);
// export const PropertyValueI18nUpdate = createInsertSchema(propertyValueI18n);

// export const PropertyValueUpdate = PropertyValueInsert.extend({
//   id: z.string()
// });

// export const PropertyValueI18nInsert = PropertyValueI18nUpdate.omit({
//   propertyValueId: true
// });

// export const PropertyValueInsertAPI = PropertyValueInsert.extend({
//   i18n: getLocales(PropertyValueI18nInsert)
// });
// export const PropertyValueUpdateAPI = PropertyValueUpdate.extend({
//   i18n: getLocales(PropertyValueI18nUpdate)
// });

// /* ----------------- */
// // PROPERTIES
// /* -------- */

// // Property Schemas
// export const PropertyBase = createSelectSchema(property);
// export const PropertyI18nBase = createSelectSchema(propertyI18n);

// // Base schema to validate submit data
// export const PropertyInsert = createInsertSchema(property).extend({
//   ...getDefaultConstraints(property)
// });

// export const PropertyUpdate = PropertyInsert.extend({
//   id: z.string()
// });

// export const PropertyI18nUpdate = createInsertSchema(propertyI18n);

// // export const PropertyI18nWithoutPK = PropertyI18nUpdate.omit({ lang: true });
// export const PropertyI18nInsert = PropertyI18nUpdate.omit({ propertyId: true });

// export const PropertyInsertAPI = PropertyInsert.extend({
//   i18n: getLocales(PropertyI18nInsert),
//   values: z.array(PropertyValueInsertAPI)
// });
// export const PropertyUpdateAPI = PropertyUpdate.extend({
//   i18n: getLocales(PropertyI18nUpdate),
//   values: z.array(PropertyValueUpdateAPI)
// });
