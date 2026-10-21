import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup.js';
import { initAuthService, getAuthService, cleanupAuthService } from '../../../src/services/authService.js';
import { makeAuthenticatedRequest } from '../../../src/utils/apiHelpers.js';

describe('SSO Session Caching, Keep-Alive Heartbeat & 401 Auto-Recovery', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'AM_BASE_URL',
    'AIC_BASE_URL',
    'AM_ADMIN_USERNAME',
    'AM_ADMIN_PASSWORD',
    'SSO_TOKEN',
    'AM_SESSION_KEEPALIVE_MS'
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    process.env.AM_BASE_URL = 'http://am.ping.local:8080/am';
    process.env.AM_ADMIN_USERNAME = 'amadmin';
    process.env.AM_ADMIN_PASSWORD = 'test-admin-password';
    delete process.env.SSO_TOKEN;
    process.env.AM_SESSION_KEEPALIVE_MS = '60000';

    initAuthService(['fr:am:*'], { allowCachedOnFirstRequest: true });
  });

  afterEach(() => {
    cleanupAuthService();
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    initAuthService(['fr:am:*'], { allowCachedOnFirstRequest: true });
  });

  describe('Layer 1: SSO Session Caching & Concurrency Deduplication', () => {
    it('caches the SSO session token across multiple requests instead of re-authenticating every call', async () => {
      let authCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', ({ request }) => {
          authCalls++;
          expect(request.headers.get('Accept-API-Version')).toBe('resource=2.0, protocol=1.0');
          expect(request.headers.get('X-OpenAM-Username')).toBe('amadmin');
          expect(request.headers.get('X-OpenAM-Password')).toBe('test-admin-password');
          return HttpResponse.json({ tokenId: `sso-token-${authCalls}` });
        })
      );

      const header1 = await getAuthService().getAuthHeader(['fr:am:*']);
      const header2 = await getAuthService().getAuthHeader(['fr:am:*']);
      const header3 = await getAuthService().getAuthHeader(['fr:am:*']);

      expect(header1).toEqual({ iPlanetDirectoryPro: 'sso-token-1' });
      expect(header2).toEqual({ iPlanetDirectoryPro: 'sso-token-1' });
      expect(header3).toEqual({ iPlanetDirectoryPro: 'sso-token-1' });
      expect(authCalls).toBe(1);
    });

    it('deduplicates concurrent authentication calls via shared in-flight promise', async () => {
      let authCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', async () => {
          authCalls++;
          await new Promise((r) => setTimeout(r, 25));
          return HttpResponse.json({ tokenId: `concurrent-sso-${authCalls}` });
        })
      );

      const [h1, h2, h3] = await Promise.all([
        getAuthService().getAuthHeader(['fr:am:*']),
        getAuthService().getAuthHeader(['fr:am:*']),
        getAuthService().getAuthHeader(['fr:am:*'])
      ]);

      expect(h1).toEqual({ iPlanetDirectoryPro: 'concurrent-sso-1' });
      expect(h2).toEqual({ iPlanetDirectoryPro: 'concurrent-sso-1' });
      expect(h3).toEqual({ iPlanetDirectoryPro: 'concurrent-sso-1' });
      expect(authCalls).toBe(1);
    });

    it('throws explicit error instead of silently falling back to OAuth when admin credentials fail', async () => {
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          return new HttpResponse(JSON.stringify({ code: 401, message: 'Authentication Failed' }), { status: 401 });
        })
      );

      await expect(getAuthService().getAuthHeader(['fr:am:*'])).rejects.toThrow(
        /PingAM admin authentication failed \(401/
      );
    });
  });

  describe('Layer 2: Proactive Session Keep-Alive Heartbeat & Pre-Expiry Rotation', () => {
    it('refreshes active SSO session via ?_action=refresh to reset idle timer', async () => {
      let refreshCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          return HttpResponse.json({ tokenId: 'active-sso-token' });
        }),
        http.post('http://am.ping.local:8080/am/json/realms/root/sessions/', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('_action') === 'refresh') {
            refreshCalls++;
            expect(request.headers.get('iPlanetDirectoryPro')).toBe('active-sso-token');
            expect(request.headers.get('Accept-API-Version')).toBe('resource=2.0, protocol=1.0');
            return HttpResponse.json({
              uid: 'amadmin',
              realm: '/',
              idletime: 0,
              maxidletime: 120,
              maxsessiontime: 480,
              maxtime: 3600
            });
          }
          return new HttpResponse(null, { status: 400 });
        })
      );

      await getAuthService().getAuthHeader(['fr:am:*']);
      const refreshed = await getAuthService().refreshSsoSession();

      expect(refreshed).toBe(true);
      expect(refreshCalls).toBe(1);
    });

    it('proactively rotates SSO session when remaining maxtime is below pre-expiry buffer (<300s)', async () => {
      let authCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          authCalls++;
          return HttpResponse.json({ tokenId: `rotated-sso-token-${authCalls}` });
        }),
        http.post('http://am.ping.local:8080/am/json/realms/root/sessions/', () => {
          return HttpResponse.json({
            uid: 'amadmin',
            realm: '/',
            idletime: 0,
            maxidletime: 120,
            maxsessiontime: 480,
            maxtime: 120 // Less than 300s buffer -> triggers proactive rotation
          });
        })
      );

      const initialHeader = await getAuthService().getAuthHeader(['fr:am:*']);
      expect(initialHeader).toEqual({ iPlanetDirectoryPro: 'rotated-sso-token-1' });

      await getAuthService().refreshSsoSession();

      const updatedHeader = await getAuthService().getAuthHeader(['fr:am:*']);
      expect(updatedHeader).toEqual({ iPlanetDirectoryPro: 'rotated-sso-token-2' });
      expect(authCalls).toBe(2);
    });

    it('re-authenticates in background if keep-alive refresh receives 401', async () => {
      let authCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          authCalls++;
          return HttpResponse.json({ tokenId: `recovered-sso-token-${authCalls}` });
        }),
        http.post('http://am.ping.local:8080/am/json/realms/root/sessions/', () => {
          return new HttpResponse(JSON.stringify({ code: 401, message: 'Session timed out' }), { status: 401 });
        })
      );

      const firstHeader = await getAuthService().getAuthHeader(['fr:am:*']);
      expect(firstHeader).toEqual({ iPlanetDirectoryPro: 'recovered-sso-token-1' });

      const refreshed = await getAuthService().refreshSsoSession();
      expect(refreshed).toBe(true);

      const nextHeader = await getAuthService().getAuthHeader(['fr:am:*']);
      expect(nextHeader).toEqual({ iPlanetDirectoryPro: 'recovered-sso-token-2' });
      expect(authCalls).toBe(2);
    });
  });

  describe('Layer 3: Reactive 401 Auto-Recovery & Transparent Retry in makeAuthenticatedRequest', () => {
    it('transparently re-authenticates and retries the API request once when PingAM returns 401 after inactivity', async () => {
      let authCalls = 0;
      let realmApiCalls = 0;

      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          authCalls++;
          return HttpResponse.json({ tokenId: `session-v${authCalls}` });
        }),
        http.get('http://am.ping.local:8080/am/json/global-config/realms', ({ request }) => {
          realmApiCalls++;
          const token = request.headers.get('iPlanetDirectoryPro');
          // Simulate session-v1 having expired after inactivity -> returns 401
          if (token === 'session-v1') {
            return new HttpResponse(JSON.stringify({ code: 401, reason: 'Unauthorized', message: 'Access Denied' }), {
              status: 401
            });
          }
          // Freshly re-authenticated session-v2 succeeds!
          if (token === 'session-v2') {
            return HttpResponse.json({ result: [{ name: '/' }, { name: 'customers' }] });
          }
          return new HttpResponse(null, { status: 401 });
        })
      );

      // 1. Prime cache with session-v1
      const initialHeader = await getAuthService().getAuthHeader(['fr:am:*']);
      expect(initialHeader).toEqual({ iPlanetDirectoryPro: 'session-v1' });

      // 2. Call makeAuthenticatedRequest after simulated inactivity where session-v1 returns 401
      const { data, response } = await makeAuthenticatedRequest(
        'http://am.ping.local:8080/am/json/global-config/realms?_queryFilter=true',
        ['fr:am:*']
      );

      expect(response.status).toBe(200);
      expect(data).toEqual({ result: [{ name: '/' }, { name: 'customers' }] });
      expect(authCalls).toBe(2);
      expect(realmApiCalls).toBe(2);
    });

    it('falls back from expired SSO_TOKEN env var to AM_ADMIN_USERNAME/PASSWORD on 401', async () => {
      process.env.SSO_TOKEN = 'stale-env-sso-token';

      let authCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          authCalls++;
          return HttpResponse.json({ tokenId: 'fresh-admin-sso-token' });
        }),
        http.get('http://am.ping.local:8080/am/json/global-config/realms', ({ request }) => {
          const token = request.headers.get('iPlanetDirectoryPro');
          if (token === 'stale-env-sso-token') {
            return new HttpResponse(JSON.stringify({ code: 401, message: 'Session expired' }), { status: 401 });
          }
          if (token === 'fresh-admin-sso-token') {
            return HttpResponse.json({ result: [{ name: '/' }] });
          }
          return new HttpResponse(null, { status: 401 });
        })
      );

      const { data, response } = await makeAuthenticatedRequest(
        'http://am.ping.local:8080/am/json/global-config/realms?_queryFilter=true',
        ['fr:am:*']
      );

      expect(response.status).toBe(200);
      expect(data).toEqual({ result: [{ name: '/' }] });
      expect(authCalls).toBe(1);
    });

    it('discovers custom PingAM cookieName from /json/serverinfo/* on 401 retry and succeeds', async () => {
      let authCalls = 0;
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', () => {
          authCalls++;
          return HttpResponse.json({ tokenId: `custom-cookie-token-${authCalls}` });
        }),
        http.get('http://am.ping.local:8080/am/json/serverinfo/*', () => {
          return HttpResponse.json({ cookieName: 'CustomAMSession' });
        }),
        http.get('http://am.ping.local:8080/am/json/global-config/realms', ({ request }) => {
          // Server only accepts CustomAMSession header, rejecting iPlanetDirectoryPro alone with 401
          const customToken = request.headers.get('CustomAMSession');
          if (!customToken) {
            return new HttpResponse(JSON.stringify({ code: 401, message: 'Access Denied' }), { status: 401 });
          }
          return HttpResponse.json({ result: [{ name: '/' }] });
        })
      );

      const { data, response } = await makeAuthenticatedRequest(
        'http://am.ping.local:8080/am/json/global-config/realms?_queryFilter=true',
        ['fr:am:*']
      );

      expect(response.status).toBe(200);
      expect(data).toEqual({ result: [{ name: '/' }] });
      expect(authCalls).toBe(2);
    });

    it('completes callback-based authentication when zero-page login is disabled on PingAM', async () => {
      server.use(
        http.post('http://am.ping.local:8080/am/json/realms/root/authenticate', async ({ request }) => {
          const body: any = await request.json();
          if (!body.authId) {
            return HttpResponse.json({
              authId: 'callback-auth-id',
              callbacks: [
                {
                  type: 'NameCallback',
                  output: [{ name: 'prompt', value: 'User Name' }],
                  input: [{ name: 'IDToken1', value: '' }],
                  _id: 0
                },
                {
                  type: 'PasswordCallback',
                  output: [{ name: 'prompt', value: 'Password' }],
                  input: [{ name: 'IDToken2', value: '' }],
                  _id: 1
                }
              ]
            });
          }
          expect(body.callbacks[0].input[0].value).toBe('amadmin');
          expect(body.callbacks[1].input[0].value).toBe('test-admin-password');
          return HttpResponse.json({ tokenId: 'callback-minted-sso-token' });
        })
      );

      const header = await getAuthService().getAuthHeader(['fr:am:*']);
      expect(header).toEqual({ iPlanetDirectoryPro: 'callback-minted-sso-token' });
    });
  });
});
