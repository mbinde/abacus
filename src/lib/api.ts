// API utility functions with CSRF protection

const CSRF_HEADER = 'X-Requested-With'
const CSRF_VALUE = 'abacus'

// Wrapper for fetch that adds CSRF header for state-changing requests
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method?.toUpperCase() || 'GET'

  // Add CSRF header for state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const headers = new Headers(options.headers)
    headers.set(CSRF_HEADER, CSRF_VALUE)
    options.headers = headers
  }

  return fetch(url, options)
}

// Convenience methods
export async function apiGet(url: string): Promise<Response> {
  return apiFetch(url)
}

export async function apiPost(url: string, body?: unknown): Promise<Response> {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPut(url: string, body?: unknown): Promise<Response> {
  return apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete(url: string): Promise<Response> {
  return apiFetch(url, { method: 'DELETE' })
}
