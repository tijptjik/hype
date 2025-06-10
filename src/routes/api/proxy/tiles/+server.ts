import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const response = await fetch(targetUrl);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Access-Control-Allow-Headers': '*'
    };

    // Handle different content types
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      // Handle JSON responses (like tile metadata)
      const data = await response.json();

      // Rewrite tile URLs in the JSON to go through our proxy
      const rewrittenData = JSON.stringify(data).replace(
        /https:\/\/tiles\.hype\.hk/g,
        '/api/proxy/tiles?url=https://tiles.hype.hk'
      );

      return json(JSON.parse(rewrittenData), { headers: corsHeaders });
    } else if (
      contentType?.includes('application/x-protobuf') ||
      targetUrl.endsWith('.mvt')
    ) {
      // Handle MVT (Mapbox Vector Tile) files
      const arrayBuffer = await response.arrayBuffer();
      return new Response(arrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/x-protobuf'
        }
      });
    } else {
      // Handle other content types
      const buffer = await response.arrayBuffer();
      return new Response(buffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType || 'application/octet-stream'
        }
      });
    }
  } catch (error) {
    return new Response(`Failed to fetch: ${error}`, { status: 500 });
  }
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
};
