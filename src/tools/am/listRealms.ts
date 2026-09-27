import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { getAmBaseUrl } from '../../utils/urlHelpers.js';

const SCOPES = ['fr:am:*'];

export const listRealmsTool = {
  name: 'listRealms',
  title: 'List Realms',
  description:
    'Discovers and lists all configured realms in the target PingAM / AIC deployment. ' +
    'Returns realm names, paths, aliases, and active status. ' +
    'Use this tool to find available realms dynamically in any deployment instead of guessing or using hardcoded names.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    queryFilter: z
      .string()
      .optional()
      .describe('Optional CREST query filter (default: "true" to list all realms). Example: name sw "cust"')
  },
  async toolFunction({ queryFilter }: { queryFilter?: string } = {}) {
    try {
      const filter = queryFilter || 'true';
      const url = `${getAmBaseUrl()}/json/global-config/realms?_queryFilter=${encodeURIComponent(filter)}`;

      const { data } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: {
          'Accept-API-Version': 'resource=1.0'
        }
      });

      const realmsData = data as { result?: Array<any>; resultCount?: number };
      const realms = (realmsData.result || []).map((r) => ({
        id: r._id,
        name: r.name,
        parentPath: r.parentPath,
        active: r.active,
        aliases: r.aliases || []
      }));

      return createToolResponse(
        JSON.stringify(
          {
            realms,
            totalRealms: realms.length
          },
          null,
          2
        )
      );
    } catch (error: any) {
      return createToolResponse(`Failed to list realms: ${error.message}`);
    }
  }
};
