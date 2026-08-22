// =============================================================================
// web/src/utils/api.js
// Thin fetch wrapper — attaches the Bearer token automatically.
// Use the named helpers (api.get, api.post, api.patch) throughout the app.
// =============================================================================

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get:   (path, token)        => request("GET",   path, undefined, token),
  post:  (path, body, token)  => request("POST",  path, body,      token),
  patch: (path, body, token)  => request("PATCH", path, body,      token),
  del:   (path, token)        => request("DELETE", path, undefined, token),
};
