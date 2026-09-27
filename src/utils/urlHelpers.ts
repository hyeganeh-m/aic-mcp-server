/**
 * Infers http:// for local development environments and https:// for cloud / remote environments.
 */
function inferProtocol(host: string): string {
  if (
    host.includes('localhost') ||
    host.includes('.local') ||
    host.includes('127.0.0.1') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.')
  ) {
    return 'http://';
  }
  return 'https://';
}

/**
 * Normalizes an AIC base URL by extracting just the hostname.
 * Removes protocol, port, paths, query params, and fragments.
 * @param url - The URL to normalize (may include protocol, path, etc.)
 * @returns The normalized hostname only
 */
export function normalizeAicBaseUrl(url: string): string {
  let normalized = url.trim();

  // Remove http:// or https:// prefix
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove everything after first occurrence of /, ?, or # (paths, query params, fragments)
  normalized = normalized.replace(/[/?#].*$/, '');

  // Remove port number (everything after and including the first colon)
  normalized = normalized.replace(/:.*$/, '');

  return normalized;
}

/**
 * Returns the effective AM base URL (e.g. http://am.ping.local:8080/am or https://<tenant>.forgeblocks.com/am)
 */
export function getAmBaseUrl(): string {
  if (process.env.AM_BASE_URL) {
    return process.env.AM_BASE_URL.trim().replace(/\/+$/, '');
  }
  const base = process.env.AIC_BASE_URL || 'am.ping.local:8080';
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base.replace(/\/+$/, '')}/am`;
  }
  return `${inferProtocol(base)}${base}/am`;
}

/**
 * Returns the effective IDM base URL (e.g. http://localhost:8082/openidm or https://<tenant>.forgeblocks.com/openidm)
 */
export function getIdmBaseUrl(): string {
  if (process.env.IDM_BASE_URL) {
    return process.env.IDM_BASE_URL.trim().replace(/\/+$/, '');
  }
  const base = process.env.AIC_BASE_URL || 'localhost:8082';
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base.replace(/\/+$/, '')}/openidm`;
  }
  return `${inferProtocol(base)}${base}/openidm`;
}

/**
 * Returns the effective OAuth2 authorize URL for the target realm.
 */
export function getAmOAuth2AuthorizeUrl(realm?: string): string {
  if (process.env.AM_OAUTH2_AUTHORIZE_URL) {
    return process.env.AM_OAUTH2_AUTHORIZE_URL.trim();
  }
  const amBase = getAmBaseUrl();
  const effectiveRealm = realm || process.env.AM_REALM || process.env.AIC_REALM;
  if (!effectiveRealm || effectiveRealm === 'root' || effectiveRealm === '/') {
    return `${amBase}/oauth2/authorize`;
  }
  const cleanRealm = effectiveRealm.startsWith('/') ? effectiveRealm.slice(1) : effectiveRealm;
  return `${amBase}/oauth2/realms/root/realms/${cleanRealm}/authorize`;
}

/**
 * Returns the effective OAuth2 token endpoint URL for the target realm.
 */
export function getAmOAuth2TokenUrl(realm?: string): string {
  if (process.env.AM_OAUTH2_TOKEN_URL) {
    return process.env.AM_OAUTH2_TOKEN_URL.trim();
  }
  const amBase = getAmBaseUrl();
  const effectiveRealm = realm || process.env.AM_REALM || process.env.AIC_REALM;
  if (!effectiveRealm || effectiveRealm === 'root' || effectiveRealm === '/') {
    return `${amBase}/oauth2/access_token`;
  }
  const cleanRealm = effectiveRealm.startsWith('/') ? effectiveRealm.slice(1) : effectiveRealm;
  return `${amBase}/oauth2/realms/root/realms/${cleanRealm}/access_token`;
}
