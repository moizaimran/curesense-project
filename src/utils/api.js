// =============================================================================
// web/src/utils/api.js
// Thin fetch wrapper — attaches the Bearer token automatically.
// Use the named helpers (api.get, api.post, api.patch) throughout the app.
// =============================================================================

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

let onUnauthorized = null;

// Called with no arguments when an authenticated request is rejected with 401
// (expired or revoked session); main.jsx uses it to sign the user out.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && onUnauthorized) onUnauthorized();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get:   (path, token)        => request("GET",   path, undefined, token),
  post:  (path, body, token)  => request("POST",  path, body,      token),
  patch: (path, body, token)  => request("PATCH", path, body,      token),
  del:   (path, token)        => request("DELETE", path, undefined, token),
};
