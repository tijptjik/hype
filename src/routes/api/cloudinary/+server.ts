// SVELTE
import { error, json } from '@sveltejs/kit'
// THIRD PARTY
import crypto from 'crypto'

export const POST = async ({ request, platform }) => {
  const body = await request.json()
  const { paramsToSign } = body
  const timestamp = Date.now()

  // Get environment variables from platform
  const CLOUDINARY_API_SECRET = platform?.env?.CLOUDINARY_API_SECRET
  const CLOUDINARY_API_KEY = platform?.env?.CLOUDINARY_API_KEY
  const CLOUDINARY_CLOUD_NAME = platform?.env?.PUBLIC_CLOUDINARY_CLOUD_NAME

  if (!CLOUDINARY_API_SECRET || !CLOUDINARY_API_KEY || !CLOUDINARY_CLOUD_NAME) {
    error(500, 'Missing Cloudinary API credentials')
  }

  try {
    // 1. Combine all parameters (except file, cloud_name, resource_type, api_key)
    const params = { ...paramsToSign, timestamp }

    // 2. Sort parameters alphabetically and create key=value pairs
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&')

    // 3. Append API secret
    const stringToSign = sortedParams + CLOUDINARY_API_SECRET

    // 4. Create SHA-1 hash
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex')

    return json({
      signature,
      timestamp,
      cloudname: CLOUDINARY_CLOUD_NAME,
      apikey: CLOUDINARY_API_KEY,
    })
  } catch (e) {
    error(500, `Failed to generate signature: ${e}`)
  }
}
