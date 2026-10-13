import axios from 'axios'

export const API_URL: string = import.meta.env.VITE_API_URL || '/api/v1'

const ACCESS_KEY = 'codeflow_token'
const REFRESH_KEY = 'codeflow_refresh_token'

export interface Tokens {
  access_token: string
  refresh_token: string
}

// Auth calls use bare axios (not the API client) so they never trigger the refresh interceptor.
export const login = async ({ email, password }: { email: string; password: string }): Promise<Tokens> => {
  const response = await axios.post(`${API_URL}/auth/login`, { email, password })
  return response.data
}

export const signup = async ({ name, email, password }: { name: string; email: string; password: string }) => {
  const response = await axios.post(`${API_URL}/auth/register`, { name, email, password })
  return response.data
}

export const refreshTokens = async (refreshToken: string): Promise<Tokens> => {
  const response = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
  return response.data
}

export const setTokens = (tokens: Tokens) => {
  localStorage.setItem(ACCESS_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
}

export const getToken = () => localStorage.getItem(ACCESS_KEY) || ''

export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY) || ''

export const logout = () => {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

/** Seconds-since-epoch expiry of a JWT, or null if it can't be read. Signature is not checked here. */
export const getTokenExpiry = (token: string): number | null => {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = JSON.parse(json).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

export const isTokenExpired = (token: string, nowSeconds = Date.now() / 1000, skewSeconds = 10) => {
  const exp = getTokenExpiry(token)
  return exp === null || exp - skewSeconds <= nowSeconds
}

/** A session is usable if either token can still get the user an API call. */
export const hasUsableSession = () => {
  const access = getToken()
  const refresh = getRefreshToken()
  return (!!access && !isTokenExpired(access)) || (!!refresh && !isTokenExpired(refresh))
}

/**
 * Turn an API failure into an honest, user-facing message: network failures, rate limits,
 * validation problems and auth failures each get their own wording.
 */
export const getAuthErrorMessage = (err: unknown, context: 'login' | 'register'): string => {
  if (!axios.isAxiosError(err)) {
    return 'An unexpected error occurred. Please try again.'
  }
  if (!err.response) {
    return 'Cannot connect to the server. Please check your connection or try again later.'
  }
  const status = err.response.status
  if (status === 429) return 'Too many attempts. Please wait a minute before trying again.'
  if (status >= 500) return 'The server ran into a problem. Please try again shortly.'

  if (context === 'login') {
    if (status === 401) return 'Invalid email or password.'
    if (status === 422) return 'Please enter a valid email address and password.'
    return 'Login failed. Please try again.'
  }
  if (status === 409) return 'This email address is already registered. Try logging in instead.'
  if (status === 422) return describeValidationError(err.response.data?.detail) || 'Please check your details.'
  return 'Registration failed. Please try again.'
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  password: 'Password',
  source_code: 'Source code',
  stdin: 'Input',
  project_id: 'Project',
  language: 'Language',
}

/** First FastAPI validation error as "Field: message", or '' if the payload isn't in that shape. */
export const describeValidationError = (detail: unknown): string => {
  if (typeof detail === 'string') return detail
  if (!Array.isArray(detail) || detail.length === 0) return ''
  const first = detail[0] as { loc?: unknown[]; msg?: string }
  const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : ''
  const label = FIELD_LABELS[field] || field
  const msg = (first.msg || '').replace(/^Value error, /, '')
  return label ? `${label}: ${msg}` : msg
}
