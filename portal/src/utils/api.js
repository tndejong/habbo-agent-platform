/**
 * Shared fetch helper for all portal API calls.
 * Automatically includes credentials and JSON headers.
 * Throws an Error with the server's error message on non-2xx responses.
 */
export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`)
  return data
}
