/**
 * Centralized WebSocket URL Builder for Lead Finder Agent Frontend.
 * Properly handles http/https -> ws/wss conversion, development ports (:3000 -> :8000),
 * production domains (no port / standard 443), and authentication tokens.
 */

export function getWebSocketBaseUrl(): string {
  // 1. Explicit NEXT_PUBLIC_WS_URL env var
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
  }

  // 2. Derive from NEXT_PUBLIC_API_URL if set
  if (process.env.NEXT_PUBLIC_API_URL) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL.trim();
    const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const withoutProto = apiUrl.replace(/^https?:/, '');
    // Strip trailing /api/v1 or /api
    const cleanBase = withoutProto.replace(/\/api(\/v1)?\/?$/, '');
    return `${wsProto}${cleanBase}`.replace(/\/+$/, '');
  }

  // 3. Fallback to browser window location
  if (typeof window !== 'undefined') {
    const isSecure = window.location.protocol === 'https:';
    const wsProto = isSecure ? 'wss:' : 'ws:';
    let host = window.location.host;

    // In local development on Next.js (port 3000 or 3001), backend is usually on 8000
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      host = host.replace(/:(3000|3001)$/, ':8000');
      // If no port specified on localhost, default to 8000
      if (!host.includes(':')) {
        host = `${host}:8000`;
      }
    }

    return `${wsProto}//${host}`;
  }

  return 'ws://127.0.0.1:8000';
}

/**
 * Returns a full WebSocket URL for a given path and optionally appends auth token.
 * 
 * @param path - e.g. "/ws/search/123" or "/api/v1/ws/events"
 * @param includeAuth - whether to append active JWT access token (default: true)
 */
export function getWebSocketUrl(path: string, includeAuth: boolean = true): string {
  const base = getWebSocketBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  let finalUrl = `${base}${cleanPath}`;

  if (includeAuth && typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (token) {
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${separator}token=${encodeURIComponent(token)}`;
    }
  }

  return finalUrl;
}
