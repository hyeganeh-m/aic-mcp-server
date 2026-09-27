// src/utils/apiHelpers.ts
import { getAuthService } from '../services/authService.js';
import { formatError } from './responseHelpers.js';
import { USER_AGENT } from './version.js';

/**
 * Makes an authenticated API request to PingOne AIC
 * @param url - The full URL to request
 * @param scopes - Array of OAuth scopes required for this request
 * @param options - Optional fetch RequestInit options (method, body, etc.)
 * @returns Object containing the parsed JSON data and the Response object
 * @throws Error if the request fails with formatted error message
 */
export async function makeAuthenticatedRequest(
  url: string,
  scopes: string[],
  options: RequestInit = {}
): Promise<{ data: unknown; response: Response }> {
  let authHeaders: Record<string, string> = {};

  const isIdmRequest = url.includes('/openidm/');

  if (isIdmRequest) {
    if (process.env.IDM_AUTH_TOKEN) {
      authHeaders = {
        'Authorization': `Basic ${process.env.IDM_AUTH_TOKEN}`,
        ...(process.env.IDM_ADMIN_USERNAME && { 'X-OpenIDM-Username': process.env.IDM_ADMIN_USERNAME }),
        ...(process.env.IDM_ADMIN_PASSWORD && { 'X-OpenIDM-Password': process.env.IDM_ADMIN_PASSWORD })
      };
    } else if (process.env.IDM_ADMIN_USERNAME && process.env.IDM_ADMIN_PASSWORD) {
      const basic = Buffer.from(
        `${process.env.IDM_ADMIN_USERNAME}:${process.env.IDM_ADMIN_PASSWORD}`
      ).toString('base64');
      authHeaders = {
        'Authorization': `Basic ${basic}`,
        'X-OpenIDM-Username': process.env.IDM_ADMIN_USERNAME,
        'X-OpenIDM-Password': process.env.IDM_ADMIN_PASSWORD
      };
    } else {
      // In on-prem / standalone AM deployments without IDM, don't trigger PKCE auth flow for missing IDM
      const isStandaloneAm = Boolean(process.env.AM_BASE_URL || (process.env.AIC_BASE_URL && !process.env.AIC_BASE_URL.includes('forgeblocks.com')));
      if (isStandaloneAm && !process.env.IDM_BASE_URL) {
        throw new Error(
          'PingIDM is not configured in this environment (IDM_BASE_URL and IDM credentials are not set). ' +
          'The platform is operating in PingAM standalone mode — all PingAM capabilities (Journeys, Nodes, Trees, Scripts, CORS) remain fully operational.'
        );
      }
      const token = await getAuthService().getToken(scopes);
      authHeaders = {
        'Authorization': `Bearer ${token}`
      };
    }
  } else {
    authHeaders = await getAuthService().getAuthHeader(scopes);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        'User-Agent': USER_AGENT,
        // Only add Content-Type header if the request has a body
        ...(options.body && { 'Content-Type': 'application/json' }),
        ...options.headers
      }
    });
  } catch (err: any) {
    if (isIdmRequest) {
      throw new Error(
        `Unable to reach PingIDM service at ${url} (${err.cause?.code || err.message}). ` +
        'PingAM remains operational, but the IDM service is unreachable or not running.'
      );
    }
    throw err;
  }


  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(formatError(response, errorBody));
  }

  // Handle empty responses (e.g., 204 No Content or DELETE operations)
  const contentLength = response.headers.get('content-length');
  const data = response.status === 204 || contentLength === '0' ? null : await response.json();

  return { data, response };
}

/**
 * Creates a standardized MCP tool response
 * @param text - The text content to return to the MCP client
 * @returns MCP-formatted response object
 */
export function createToolResponse(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text
      }
    ]
  };
}
