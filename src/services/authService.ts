// src/services/authService.ts
import type { Server as HttpServer } from 'http';
import { TokenStorage, TokenData, KeychainStorage, FileStorage } from './tokenStorage.js';
import { executePkceFlow as runPkceFlow } from './flows/pkceFlow.js';
import { executeDeviceFlow as runDeviceFlow } from './flows/deviceFlow.js';
import { USER_AGENT } from '../utils/version.js';
import { getAmBaseUrl, getAmOAuth2AuthorizeUrl, getAmOAuth2TokenUrl } from '../utils/urlHelpers.js';

// --- Configuration ---
const getAicBaseUrl = () => process.env.AIC_BASE_URL || 'am.ping.local:8080';

// Fixed OAuth configuration
const CLIENT_ID = 'AICMCPClient';
const EXCHANGE_CLIENT_ID = 'AICMCPExchangeClient';
const REDIRECT_URI_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}`;


/**
 * Clock skew tolerance in milliseconds
 * Tokens are considered expired this many milliseconds before actual expiry
 * to account for clock drift between client and server
 */
const CLOCK_SKEW_BUFFER_MS = 60 * 1000; // 60 seconds

/**
 * Default interval (5 minutes) for refreshing PingAM SSO sessions in the background
 * so they never expire due to inactivity (maxIdleTime) while the MCP server is alive.
 */
const DEFAULT_SSO_KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Proactive rotation buffer (5 minutes in seconds).
 * When PingAM reports fewer than this many seconds remaining until hard maxSessionTime,
 * the keep-alive heartbeat proactively mints a fresh SSO token.
 */
const SSO_PRE_EXPIRY_BUFFER_SECONDS = 300;

/**
 * Configuration for AuthService behavior
 */
export interface AuthServiceConfig {
  allowCachedOnFirstRequest?: boolean;
  mcpServer?: any; // MCP server instance for device code flow elicitation
}

/**
 * Authentication service supporting OAuth 2.0 PKCE and Device Code flows
 * Handles user authentication and token management with automatic mode selection
 */
class AuthService {
  private tokenPromise: Promise<string> | null = null;
  private redirectServer: HttpServer | null = null;
  private allScopes: string[];
  private hasAuthenticatedThisSession: boolean = false;
  private config: AuthServiceConfig;
  private useDeviceCode: boolean;
  private storage: TokenStorage;
  private mcpServer?: any;
  private deviceCodeVerifier?: string; // PKCE verifier for device code flow
  private cachedSsoToken: string | null = null;
  private ssoTokenPromise: Promise<string | null> | null = null;
  private ssoKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private ssoEnvTokenInvalidated: boolean = false;
  private lastKnownEnvSsoToken: string | undefined = undefined;

  constructor(allScopes: string[], config: AuthServiceConfig = {}) {
    this.allScopes = allScopes;
    this.config = config;
    this.mcpServer = config.mcpServer;

    // Docker build sets DOCKER_CONTAINER=true
    const inDocker = process.env.DOCKER_CONTAINER === 'true';

    this.useDeviceCode = inDocker;

    this.storage = inDocker ? new FileStorage('/app/tokens/token.json') : new KeychainStorage();
  }

  /**
   * Get the primary access token with all scopes
   * Retrieves from storage if available and valid, otherwise performs authentication
   * Always requires fresh authentication on first request of the session
   * @returns Primary access token with all scopes
   */
  private async getPrimaryToken(): Promise<string> {
    // If token request is already in flight, return existing promise
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Share the entire primary-token acquisition path, including storage lookup.
    // This prevents parallel tool requests from racing each other into duplicate
    // keychain reads or unexpected interactive authentication.
    this.tokenPromise = (async () => {
      const shouldSkipCache = !this.hasAuthenticatedThisSession && !this.config.allowCachedOnFirstRequest;

      if (!shouldSkipCache) {
        try {
          const tokenData = await this.storage.getToken();
          if (tokenData) {
            const { accessToken, expiresAt, aicBaseUrl } = tokenData;

            const currentAicBaseUrl = getAicBaseUrl();
            if (aicBaseUrl !== currentAicBaseUrl) {
              console.error(
                `Cached token is for different tenant (${aicBaseUrl}), current tenant is ${currentAicBaseUrl}. Re-authenticating...`
              );
            } else if (Date.now() + CLOCK_SKEW_BUFFER_MS < expiresAt) {
              return accessToken;
            }
          }
        } catch (error) {
          console.error('Error accessing token storage:', error);
        }
      } else {
        console.error('Fresh authentication required on startup');
      }

      return this.useDeviceCode ? this.executeDeviceFlow(this.allScopes) : this.executePkceFlow(this.allScopes);
    })();

    try {
      return await this.tokenPromise;
    } finally {
      // Clear promise after awaiting so all concurrent waiters receive the result
      this.tokenPromise = null;
    }
  }

  /**
   * Exchange the primary token for a scoped-down token via RFC 8693 token exchange
   * @param primaryToken - The broad-scope access token
   * @param requestedScopes - Specific scopes needed for this operation
   * @returns Scoped access token
   */
  private async exchangeToken(primaryToken: string, requestedScopes: string[]): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
    params.append('subject_token', primaryToken);
    params.append('subject_token_type', 'urn:ietf:params:oauth:token-type:access_token');
    params.append('requested_token_type', 'urn:ietf:params:oauth:token-type:access_token');
    params.append('scope', requestedScopes.join(' '));
    params.append('client_id', EXCHANGE_CLIENT_ID);

    const response = await fetch(getAmOAuth2TokenUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: params
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `Token exchange failed (${response.status} ${response.statusText}): ${errorText}`;

      // For 401, throw a specific error that we can catch and retry with re-auth
      if (response.status === 401) {
        const error = new Error(errorMessage);
        (error as any).shouldRetryWithReauth = true;
        throw error;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Get a valid access token scoped to specific permissions via token exchange
   * @param scopes - OAuth scopes required for this operation
   * @returns Access token scoped to the requested permissions
   */
  async getToken(scopes?: string[]): Promise<string> {
    if (!scopes || scopes.length === 0) {
      throw new Error('Scopes parameter is required for token exchange');
    }

    console.error(`Token exchange: requesting scopes [${scopes.join(', ')}]`);

    try {
      // Get primary token (may trigger PKCE flow)
      const primaryToken = await this.getPrimaryToken();

      // Exchange for scoped-down token
      const exchangedToken = await this.exchangeToken(primaryToken, scopes);

      console.error(`Token exchange successful for scopes: [${scopes.join(', ')}]`);

      return exchangedToken;
    } catch (error: unknown) {
      // If token exchange failed due to expired/invalid token, retry with fresh auth
      if (error && typeof error === 'object' && 'shouldRetryWithReauth' in error && error.shouldRetryWithReauth) {
        console.error('Primary token invalid, re-authenticating and retrying token exchange...');

        // Force fresh authentication
        this.hasAuthenticatedThisSession = false;

        // Get fresh primary token (will trigger PKCE flow)
        const freshPrimaryToken = await this.getPrimaryToken();

        // Retry exchange with fresh token
        const exchangedToken = await this.exchangeToken(freshPrimaryToken, scopes);

        console.error(`Token exchange successful after re-authentication for scopes: [${scopes.join(', ')}]`);

        return exchangedToken;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Synchronizes in-memory SSO state if process.env.SSO_TOKEN changed dynamically.
   */
  private syncEnvSsoTokenState(): void {
    if (process.env.SSO_TOKEN !== this.lastKnownEnvSsoToken) {
      this.lastKnownEnvSsoToken = process.env.SSO_TOKEN;
      this.ssoEnvTokenInvalidated = false;
      this.cachedSsoToken = process.env.SSO_TOKEN || null;
    }
  }

  /**
   * Invalidates the currently cached SSO session token so the next request
   * or background heartbeat will acquire a fresh session.
   */
  invalidateSsoSession(): void {
    this.cachedSsoToken = null;
    if (process.env.SSO_TOKEN) {
      this.ssoEnvTokenInvalidated = true;
    }
  }

  /**
   * Resolves the keep-alive interval in milliseconds for SSO session refresh.
   */
  private getKeepAliveIntervalMs(): number {
    const raw = process.env.AM_SESSION_KEEPALIVE_MS;
    if (raw) {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return DEFAULT_SSO_KEEPALIVE_INTERVAL_MS;
  }

  /**
   * Starts the background unref'd timer that periodically calls PingAM's
   * `/json/realms/root/sessions/?_action=refresh` endpoint to reset idle time (idletime = 0)
   * and proactively rotate the session before hard maxSessionTime expiration.
   */
  private startSsoKeepAlive(): void {
    if (this.ssoKeepAliveTimer) {
      return;
    }
    const intervalMs = this.getKeepAliveIntervalMs();
    if (intervalMs <= 0) {
      return;
    }
    this.ssoKeepAliveTimer = setInterval(() => {
      void this.refreshSsoSession();
    }, intervalMs);
    this.ssoKeepAliveTimer.unref?.();
  }

  /**
   * Stops the background SSO keep-alive timer.
   */
  private stopSsoKeepAlive(): void {
    if (this.ssoKeepAliveTimer) {
      clearInterval(this.ssoKeepAliveTimer);
      this.ssoKeepAliveTimer = null;
    }
  }

  /**
   * Refreshes the active PingAM SSO session (`?_action=refresh`) to reset the idle timer.
   * If the session has expired (401/403) or is within `SSO_PRE_EXPIRY_BUFFER_SECONDS` of
   * PingAM's hard `maxSessionTime` limit, proactively re-authenticates when admin credentials are set.
   */
  async refreshSsoSession(): Promise<boolean> {
    if (!this.cachedSsoToken) {
      return false;
    }

    const amBase = getAmBaseUrl();
    try {
      const res = await fetch(`${amBase}/json/realms/root/sessions/?_action=refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-API-Version': 'resource=2.0, protocol=1.0',
          'User-Agent': USER_AGENT,
          'iPlanetDirectoryPro': this.cachedSsoToken
        }
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          this.invalidateSsoSession();
          if (process.env.AM_ADMIN_USERNAME && process.env.AM_ADMIN_PASSWORD) {
            try {
              await this.getSsoSessionToken(true);
              return true;
            } catch (err) {
              console.error('Background SSO session re-authentication failed:', err);
            }
          }
        }
        return false;
      }

      const data: any = await res.json().catch(() => null);
      if (
        data &&
        typeof data.maxtime === 'number' &&
        data.maxtime < SSO_PRE_EXPIRY_BUFFER_SECONDS &&
        process.env.AM_ADMIN_USERNAME &&
        process.env.AM_ADMIN_PASSWORD
      ) {
        try {
          await this.getSsoSessionToken(true);
        } catch (err) {
          console.error('Proactive SSO session rotation before maxSessionTime failed:', err);
        }
      }
      return true;
    } catch (err) {
      console.error('Background SSO session keep-alive check failed:', err);
      return false;
    }
  }

  /**
   * Authenticates against PingAM `/json/realms/root/authenticate` using admin credentials,
   * with a single automatic retry on transient network/socket errors after inactivity.
   */
  private async authenticateAdminSession(): Promise<string> {
    const amBase = getAmBaseUrl();
    const authUrl = `${amBase}/json/realms/root/authenticate`;
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-API-Version': 'resource=2.0, protocol=1.0',
        'User-Agent': USER_AGENT,
        'X-OpenAM-Username': process.env.AM_ADMIN_USERNAME!,
        'X-OpenAM-Password': process.env.AM_ADMIN_PASSWORD!
      },
      body: JSON.stringify({})
    };

    let res: Response;
    try {
      res = await fetch(authUrl, requestInit);
    } catch (firstErr) {
      // Retry once if a stale keep-alive socket closed during inactivity
      res = await fetch(authUrl, requestInit);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`PingAM admin authentication failed (${res.status} ${res.statusText}): ${errorText}`);
    }

    const data: any = await res.json();
    if (!data || !data.tokenId) {
      throw new Error('PingAM admin authentication response did not contain a tokenId');
    }

    this.cachedSsoToken = data.tokenId;
    this.startSsoKeepAlive();
    return data.tokenId;
  }

  /**
   * If standalone PingAM credentials (AM_ADMIN_USERNAME / AM_ADMIN_PASSWORD) or SSO_TOKEN are set,
   * acquire or reuse a cached admin SSO session token (iPlanetDirectoryPro).
   */
  private async getSsoSessionToken(forceRefresh: boolean = false): Promise<string | null> {
    this.syncEnvSsoTokenState();

    if (forceRefresh) {
      this.invalidateSsoSession();
    }

    if (this.cachedSsoToken) {
      this.startSsoKeepAlive();
      return this.cachedSsoToken;
    }

    if (process.env.SSO_TOKEN && !this.ssoEnvTokenInvalidated) {
      this.cachedSsoToken = process.env.SSO_TOKEN;
      this.startSsoKeepAlive();
      return this.cachedSsoToken;
    }

    if (process.env.AM_ADMIN_USERNAME && process.env.AM_ADMIN_PASSWORD) {
      if (this.ssoTokenPromise) {
        return this.ssoTokenPromise;
      }

      this.ssoTokenPromise = this.authenticateAdminSession();
      try {
        return await this.ssoTokenPromise;
      } finally {
        this.ssoTokenPromise = null;
      }
    }

    if (process.env.SSO_TOKEN && this.ssoEnvTokenInvalidated) {
      throw new Error(
        'The configured SSO_TOKEN has expired or been invalidated by PingAM (401 Unauthorized). ' +
        'Configure AM_ADMIN_USERNAME and AM_ADMIN_PASSWORD so the MCP server can automatically re-authenticate when sessions expire.'
      );
    }

    return null;
  }

  /**
   * Returns the appropriate authorization headers for PingAM requests.
   * Uses SSO session token (iPlanetDirectoryPro) if standalone PingAM admin credentials exist,
   * otherwise uses the OAuth2 Bearer token (via PKCE and token exchange).
   */
  async getAuthHeader(scopes: string[], options: { forceRefresh?: boolean } = {}): Promise<Record<string, string>> {
    const ssoToken = await this.getSsoSessionToken(options.forceRefresh);
    if (ssoToken) {
      return { 'iPlanetDirectoryPro': ssoToken };
    }

    const token = await this.getToken(scopes);
    return { 'Authorization': `Bearer ${token}` };
  }

  /**
   * Executes the OAuth2 PKCE flow to obtain a new access token
   */
  private async executePkceFlow(scopes: string[]): Promise<string> {
    try {
      const { accessToken, expiresIn } = await runPkceFlow({
        scopes,
        authorizeUrl: getAmOAuth2AuthorizeUrl(),
        tokenUrl: getAmOAuth2TokenUrl(),
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        redirectPort: REDIRECT_URI_PORT,
        aicBaseUrl: getAicBaseUrl(),
        onServerCreated: (server) => {
          this.redirectServer = server;
        },
        onServerClosed: () => {
          this.redirectServer = null;
        }
      });

      const expiresAt = Date.now() + expiresIn * 1000;

      try {
        const tokenData: TokenData = {
          accessToken,
          expiresAt,
          aicBaseUrl: getAicBaseUrl()
        };
        await this.storage.setToken(tokenData);
      } catch (error) {
        console.error('Failed to store token in storage:', error);
      }

      this.hasAuthenticatedThisSession = true;
      return accessToken;
    } catch (error) {
      console.error('User authentication failed:', error);
      throw error;
    }
  }

  /**
   * Execute the complete OAuth Device Code Flow with MCP form elicitation
   * @param scopes - OAuth scopes to request
   * @returns Primary access token
   */
  private async executeDeviceFlow(scopes: string[]): Promise<string> {
    if (!this.mcpServer) {
      throw new Error('MCP server reference required for device code flow. Pass mcpServer in AuthServiceConfig.');
    }

    const verifierState = {
      set: (value: string) => {
        this.deviceCodeVerifier = value;
      },
      get: () => this.deviceCodeVerifier,
      clear: () => {
        this.deviceCodeVerifier = undefined;
      }
    };

    const tokenData = await runDeviceFlow({
      scopes,
      clientId: CLIENT_ID,
      aicBaseUrl: getAicBaseUrl(),
      tokenUrl: getAmOAuth2TokenUrl(),
      storage: this.storage,
      mcpServer: this.mcpServer,
      verifierState
    });

    this.hasAuthenticatedThisSession = true;
    return tokenData.access_token;
  }

  /**
   * Cleanup resources (e.g., HTTP server for redirect, SSO keep-alive timer)
   * Safe to call multiple times
   */
  cleanup(): void {
    this.stopSsoKeepAlive();
    if (this.redirectServer) {
      try {
        this.redirectServer.close();
      } catch (error) {
        console.error('Error closing redirect server:', error);
      }
      this.redirectServer = null;
    }
  }
}

// Singleton instance
let instance: AuthService;

/**
 * Initialize the authentication service with required scopes
 * @param allScopes - All OAuth scopes needed by the application
 * @param config - Optional configuration for AuthService behavior
 */
export function initAuthService(allScopes: string[], config: AuthServiceConfig = {}): void {
  if (instance) {
    instance.cleanup();
  }
  instance = new AuthService(allScopes, config);
}

/**
 * Get the singleton authentication service instance
 * @returns The AuthService instance
 * @throws Error if service not initialized
 */
export function getAuthService(): AuthService {
  if (!instance) {
    instance = new AuthService([]);
  }
  return instance;
}

/**
 * Cleanup authentication service resources
 * Closes any running redirect server
 */
export function cleanupAuthService(): void {
  if (instance) {
    instance.cleanup();
  }
}
