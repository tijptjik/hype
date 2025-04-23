import { PRIVATE_CLOUDINARY_API_SECRET } from '$env/static/private';
import { error, json } from '@sveltejs/kit';
import crypto from 'crypto';

export const POST = async ({ request }) => {
  const body = await request.json();
  const { paramsToSign } = body;
  let timestamp = Date.now();

  try {
    // 1. Combine all parameters (except file, cloud_name, resource_type, api_key)
    const params = { ...paramsToSign, timestamp };

    // 2. Sort parameters alphabetically and create key=value pairs
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    // 3. Append API secret
    const stringToSign = sortedParams + PRIVATE_CLOUDINARY_API_SECRET;

    // 4. Create SHA-1 hash
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    return json({
      signature,
      timestamp,
      cloudname: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
      apikey: import.meta.env.VITE_CLOUDINARY_API_KEY
    });
  } catch (e) {
    error(500, `Failed to generate signature: ${e}`);
  }
};
