/**
 * Shared fetch helper for all portal API calls.
 * Automatically includes credentials and JSON headers.
 * Throws an Error with the server's error message on non-2xx responses.
 */
export async function api(path, options = {}) {
  // Auto-stringify plain object bodies so callers don't have to call JSON.stringify.
  // Bodies that are already strings (or other fetch-valid types) pass through unchanged.
  const body = options.body !== null && options.body !== undefined && typeof options.body === 'object' && !(options.body instanceof Blob) && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams) && !(options.body instanceof ReadableStream)
    ? JSON.stringify(options.body)
    : options.body
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    ...(body !== undefined ? { body } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`)
  return data
}
