import { describe, it, expect } from 'vitest';
import { listRealmsTool } from '../../../src/tools/am/listRealms.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';

describe('listRealms', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listRealms', listRealmsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL pointing at the global realms endpoint', async () => {
      await listRealmsTool.toolFunction();

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/global-config/realms');
    });

    it('should include _queryFilter=true by default', async () => {
      await listRealmsTool.toolFunction();

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_queryFilter=true');
    });

    it('should allow custom queryFilter', async () => {
      await listRealmsTool.toolFunction({ queryFilter: 'name sw "cust"' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_queryFilter=' + encodeURIComponent('name sw "cust"'));
    });

    it('should use GET method', async () => {
      await listRealmsTool.toolFunction();

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should include Accept-API-Version: resource=1.0 header', async () => {
      await listRealmsTool.toolFunction();

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['Accept-API-Version']).toBe('resource=1.0');
    });

    it('should pass fr:am:* scopes', async () => {
      await listRealmsTool.toolFunction();

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return formatted response text', async () => {
      const result = await listRealmsTool.toolFunction();
      expect(result.content[0].text).toBeDefined();
    });
  });
});
