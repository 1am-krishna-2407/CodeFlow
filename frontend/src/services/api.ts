import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { API_URL, describeValidationError, getRefreshToken, getToken, logout, refreshTokens, setTokens } from './auth'

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timeout'
export type Language = 'python' | 'java' | 'cpp'

export interface JobResult {
  stdout: string | null
  stderr: string | null
  exit_code: number | null
  execution_time: number | null // seconds the program itself ran
  compile_time: number | null // seconds compiling; null for Python
}

export interface JobSummary {
  id: string
  project_id: string | null
  language: Language
  status: JobStatus
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface JobDetail extends JobSummary {
  source_code: string
  stdin: string | null
  result: JobResult | null
}

export interface JobPage {
  items: JobSummary[]
  total: number
  skip: number
  limit: number
}

export interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Stats {
  total: number
  success: number
  failed: number
  queued: number
  running: number
  timeout: number
}

/** Fired when the session can't be recovered, so the app can route to the login page. */
export const SESSION_EXPIRED_EVENT = 'codeflow:session-expired'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// One refresh in flight at a time: concurrent 401s all wait on the same promise.
let refreshing: Promise<string> | null = null

const refreshAccessToken = (): Promise<string> => {
  if (!refreshing) {
    const refreshToken = getRefreshToken()
    refreshing = (refreshToken ? refreshTokens(refreshToken) : Promise.reject(new Error('no refresh token')))
      .then((tokens) => {
        setTokens(tokens)
        return tokens.access_token
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    if (error.response?.status !== 401 || !original || original._retried) {
      throw error
    }
    original._retried = true
    try {
      const token = await refreshAccessToken()
      original.headers.Authorization = `Bearer ${token}`
      return apiClient(original)
    } catch {
      logout()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      throw error
    }
  },
)

/** User-facing message for any failed API call. */
export const getApiErrorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (!axios.isAxiosError(err)) return fallback
  if (!err.response) return 'Cannot connect to the server. Please check your connection.'
  const { status, data } = err.response
  if (status === 422) return describeValidationError(data?.detail) || 'The request was invalid.'
  if (typeof data?.detail === 'string') return data.detail
  if (status === 429) return 'Too many requests. Please slow down and try again shortly.'
  if (status >= 500) return 'The server ran into a problem. Please try again shortly.'
  return fallback
}

export const getStats = async (): Promise<Stats> => (await apiClient.get('/dashboard/stats')).data

export const createJob = async (payload: {
  project_id: string | null
  language: Language
  source_code: string
  stdin?: string | null
}): Promise<{ job_id: string; status: JobStatus }> => (await apiClient.post('/jobs', payload)).data

export const getJobs = async (params: {
  skip?: number
  limit?: number
  status?: JobStatus
  language?: Language
  project_id?: string
} = {}): Promise<JobPage> => (await apiClient.get('/jobs', { params })).data

export const getJob = async (jobId: string): Promise<JobDetail> => (await apiClient.get(`/jobs/${jobId}`)).data

export const deleteJob = async (jobId: string): Promise<void> => {
  await apiClient.delete(`/jobs/${jobId}`)
}

export const getProjects = async (): Promise<Project[]> => (await apiClient.get('/projects')).data

export const createProject = async (payload: { name: string; description?: string | null }): Promise<Project> =>
  (await apiClient.post('/projects', payload)).data

export const deleteProject = async (projectId: string): Promise<void> => {
  await apiClient.delete(`/projects/${projectId}`)
}

/** Revoke every token for this user on the server. Best effort: local logout happens regardless. */
export const revokeSession = async (): Promise<void> => {
  try {
    await apiClient.post('/auth/logout')
  } catch {
    // Already-invalid sessions or network errors shouldn't block logging out locally.
  }
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  created_at: string
}

export const getMe = async (): Promise<CurrentUser> => (await apiClient.get('/users/me')).data
