// TYPES

/* ----------------- */
// PROPERTIES
/* -------- */

type ParamsToSign = {
  folder: string
  public_id?: string | null
  media_metadata?: 'true'
}

type DeleteParamsToSign = {
  public_id: string | null
}
