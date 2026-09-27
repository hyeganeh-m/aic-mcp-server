/**
 * Initialization module that validates and normalizes environment variables.
 * Must be imported before other application modules to ensure consistent configuration.
 */

import { normalizeAicBaseUrl } from './utils/urlHelpers.js';

// Validate required environment variable
if (!process.env.AIC_BASE_URL && !process.env.AM_BASE_URL) {
  process.env.AIC_BASE_URL = 'http://am.ping.local:8080';
}

if (process.env.AIC_BASE_URL) {
  process.env.AIC_BASE_URL = normalizeAicBaseUrl(process.env.AIC_BASE_URL);
}

