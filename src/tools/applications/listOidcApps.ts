import { getIdmBaseUrl } from '../../utils/urlHelpers.js';
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

import { buildAMRealmUrl, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idm:*'];

export const listOidcAppsTool = {
  name: 'listOidcApps',
  title: 'List OIDC Apps',
  description:
    'Lists OIDC applications in a realm with summary fields only. ' +
    'Use getOidcApp for full details of a specific app.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm'),
    queryFilter: z
      .string()
      .optional()
      .describe('Optional CREST query filter. Default: true (all apps). ' + 'Example: name sw "my"')
  },
  async toolFunction({ realm, queryFilter }: { realm: (typeof REALMS)[number]; queryFilter?: string }) {
    try {
      const filter = queryFilter || 'true';
      const isStandaloneAm = Boolean(
        !process.env.IDM_BASE_URL &&
        (process.env.AM_BASE_URL || !process.env.AIC_BASE_URL?.includes('forgeblocks.com'))
      );

      let url: string;
      let scopes = SCOPES;
      let headers: Record<string, string> = {};

      if (isStandaloneAm) {
        url = `${buildAMRealmUrl(realm, 'realm-config/agents/OAuth2Client')}?_queryFilter=${encodeURIComponent(filter)}`;
        headers = { ...AM_OAUTH2_CLIENT_HEADERS };
      } else {
        const fields = 'name,ssoEntities,templateName,authoritative,_id';
        url =
          `${getIdmBaseUrl()}/managed/${realm}_application` +
          `?_queryFilter=${encodeURIComponent(filter)}&_fields=${fields}`;
      }

      const { data, response } = await makeAuthenticatedRequest(url, scopes, {
        method: 'GET',
        headers
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list OIDC apps: ${error.message}`);
    }
  }
};
