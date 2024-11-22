import { PRIVATE_CLOUDINARY_API_SECRET } from '$env/static/private';
import { v2 as cloudinary } from 'cloudinary';
import { error, json } from '@sveltejs/kit';

export const POST = async ({ request }) => {
  const body = await request.json();
  const { paramsToSign } = body;
  let timestamp = Date.now();

  try {
    const signature = cloudinary.utils.api_sign_request(
      { ...paramsToSign, timestamp },
      PRIVATE_CLOUDINARY_API_SECRET
    );
    return json({
      signature,
      timestamp,
      cloudname: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
      apikey: import.meta.env.VITE_CLOUDINARY_API_KEY
    });
  } catch (e) {
    return error(500, `${error}`);
  }
};