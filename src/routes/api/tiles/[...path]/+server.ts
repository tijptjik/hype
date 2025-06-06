import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch, url, request }) => {
  const tilePath = params.path;
  
  if (!tilePath) {
    return new Response('Invalid tile path', { status: 400 });
  }

  // Prevent infinite loops - if the path already contains our API path, don't proxy
  if (tilePath.includes('api/tiles')) {
    return new Response('Invalid tile path - recursive reference', { status: 400 });
  }

  // Construct the full URL to tiles.hype.hk
  const targetUrl = `https://tiles.hype.hk/${tilePath}`;

  try {
    // Use global fetch to ensure we're not using SvelteKit's enhanced fetch
    const response = await globalThis.fetch(targetUrl);
    
    if (!response.ok) {
      return new Response(`Tile not found: ${response.statusText}`, { 
        status: response.status 
      });
    }

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
      
      // Get the protocol and host from the current request
      // Check headers for the original protocol (common with proxies like ngrok)
      const host = url.host;
      const isNgrok = host.includes('ngrok');
      const forwardedProto = request.headers.get('x-forwarded-proto') || 
                            request.headers.get('x-forwarded-protocol');
      
      // Determine the correct protocol
      let protocol: string;
      if (forwardedProto) {
        protocol = forwardedProto;
      } else if (isNgrok) {
        protocol = 'https'; // ngrok always uses HTTPS
      } else {
        protocol = url.protocol.replace(':', '');
      }
      
      const baseUrl = `${protocol}://${host}`;
      
      // Function to recursively rewrite URLs in the JSON object
      const rewriteUrls = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj.replace(/https:\/\/tiles\.hype\.hk\//g, `${baseUrl}/api/tiles/`);
        } else if (Array.isArray(obj)) {
          return obj.map(rewriteUrls);
        } else if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = rewriteUrls(value);
          }
          return result;
        }
        return obj;
      };
      
      const rewrittenData = rewriteUrls(data);
      
      return json(rewrittenData, { headers: corsHeaders });
    } 
    else if (contentType?.includes('application/x-protobuf') || tilePath.endsWith('.mvt')) {
      // Handle MVT (Mapbox Vector Tile) files
      const arrayBuffer = await response.arrayBuffer();
      return new Response(arrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/x-protobuf'
        }
      });
    }
    else {
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
    return new Response(`Failed to fetch tile: ${error}`, { status: 500 });
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