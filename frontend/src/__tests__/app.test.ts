import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJwt } from './setup'
import {
  describeValidationError,
  getAuthErrorMessage,
  getRefreshToken,
  getToken,
  hasUsableSession,
  isTokenExpired,
  logout,
  setTokens,
} from '../services/auth'
import { apiClient, getApiErrorMessage, getStats, SESSION_EXPIRED_EVENT } from '../services/api'
import { displayStatus, formatSeconds, isTerminal, nextPollDelay } from '../lib/jobs'

const now = () => Math.floor(Date.now() / 1000)

const axiosError = (status?: number, data?: unknown) => {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError('fail', 'ERR', config, undefined,
    status === undefined ? undefined : { status, data, statusText: '', headers: {}, config })
}

beforeEach(() => localStorage.clear())

describe('token storage and expiry', () => {
  it('stores and clears both tokens', () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    expect([getToken(), getRefreshToken()]).toEqual(['a', 'r'])
    logout()
    expect([getToken(), getRefreshToken()]).toEqual(['', ''])
  })

  it('reads JWT expiry', () => {
    expect(isTokenExpired(makeJwt({ exp: now() + 600 }))).toBe(false)
    expect(isTokenExpired(makeJwt({ exp: now() - 1 }))).toBe(true)
    expect(isTokenExpired('not-a-jwt')).toBe(true)
  })

  it('treats a live refresh token as a usable session', () => {
    setTokens({ access_token: makeJwt({ exp: now() - 5 }), refresh_token: makeJwt({ exp: now() + 3600 }) })
    expect(hasUsableSession()).toBe(true)
    setTokens({ access_token: makeJwt({ exp: now() - 5 }), refresh_token: makeJwt({ exp: now() - 5 }) })
    expect(hasUsableSession()).toBe(false)
  })
})

describe('error messages', () => {
  it('distinguishes network failures from bad credentials', () => {
    expect(getAuthErrorMessage(axiosError(), 'login')).toMatch(/Cannot connect/)
    expect(getAuthErrorMessage(axiosError(401), 'login')).toBe('Invalid email or password.')
    expect(getAuthErrorMessage(axiosError(429), 'login')).toMatch(/Too many/)
    expect(getAuthErrorMessage(axiosError(500), 'register')).toMatch(/server ran into a problem/)
  })

  it('explains registration conflicts and validation errors', () => {
    expect(getAuthErrorMessage(axiosError(409), 'register')).toMatch(/already registered/)
    const detail = [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }]
    expect(getAuthErrorMessage(axiosError(422, { detail }), 'register')).toBe('Password: String should have at least 8 characters')
  })

  it('surfaces API detail strings', () => {
    expect(getApiErrorMessage(axiosError(429, { detail: 'Too many jobs in progress.' }))).toBe('Too many jobs in progress.')
    expect(describeValidationError([{ loc: ['body', 'source_code'], msg: 'Value error, source_code exceeds 65536 bytes' }]))
      .toBe('Source code: source_code exceeds 65536 bytes')
  })
})

describe('job helpers', () => {
  it('knows terminal statuses', () => {
    expect(['completed', 'failed', 'timeout'].every(isTerminal)).toBe(true)
    expect(isTerminal('queued') || isTerminal('running')).toBe(false)
  })

  it('labels memory-limit failures', () => {
    expect(displayStatus({ status: 'failed', result: { stderr: 'Memory limit exceeded (128m).', stdout: '', exit_code: 137, execution_time: 1, compile_time: null } }))
      .toBe('memory limit')
    expect(displayStatus({ status: 'completed', result: null })).toBe('completed')
  })

  it('backs off polling up to a ceiling', () => {
    const delays: number[] = []
    let d: number | null = null
    for (let i = 0; i < 10; i++) delays.push((d = nextPollDelay(d)))
    expect(delays[0]).toBe(500)
    expect(delays.every((v, i) => i === 0 || v >= delays[i - 1])).toBe(true)
    expect(Math.max(...delays)).toBe(5000)
  })

  it('formats seconds', () => {
    expect(formatSeconds(0.25)).toBe('250 ms')
    expect(formatSeconds(2.5)).toBe('2.50 s')
    expect(formatSeconds(null)).toBe('–')
  })
})

describe('API client session handling', () => {
  const originalAdapter = apiClient.defaults.adapter
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
  })

  const respond = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
    const response = { status, data, statusText: '', headers: {}, config }
    if (status >= 400) return Promise.reject(new AxiosError('fail', 'ERR', config, undefined, response))
    return Promise.resolve(response)
  }

  it('refreshes an expired access token once and retries the request', async () => {
    setTokens({ access_token: 'old', refresh_token: 'refresh-1' })
    const seen: string[] = []
    apiClient.defaults.adapter = (config) => {
      const auth = String(config.headers.Authorization)
      seen.push(auth)
      return auth === 'Bearer new' ? respond(config, 200, { total: 1 }) : respond(config, 401, {})
    }
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new', refresh_token: 'refresh-2' } })

    expect(await getStats()).toEqual({ total: 1 })
    expect(seen).toEqual(['Bearer old', 'Bearer new'])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBe('refresh-2')
  })

  it('logs out and announces it when the refresh fails', async () => {
    setTokens({ access_token: 'old', refresh_token: 'dead' })
    apiClient.defaults.adapter = (config) => respond(config, 401, {})
    vi.spyOn(axios, 'post').mockRejectedValue(axiosError(401))
    const expired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, expired)

    await expect(getStats()).rejects.toBeInstanceOf(AxiosError)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(getToken()).toBe('')
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired)
  })
})

describe('logout', () => {
  it('revokes on the server and never throws', async () => {
    const { revokeSession } = await import('../services/api')
    const calls: string[] = []
    apiClient.defaults.adapter = (config) => {
      calls.push(`${config.method} ${config.url}`)
      return Promise.reject(new AxiosError('offline', 'ERR_NETWORK', config))
    }
    await expect(revokeSession()).resolves.toBeUndefined()
    expect(calls).toEqual(['post /auth/logout'])
  })
})

describe('run outcomes and formatting', () => {
  const result = (over: Partial<import('../services/api').JobResult>) => ({
    stdout: '', stderr: '', exit_code: 0, execution_time: 0.1, compile_time: null, ...over,
  })

  it('distinguishes compile errors from runtime failures', async () => {
    const { outcome, isTruncated } = await import('../lib/jobs')
    expect(outcome({ status: 'failed', result: result({ exit_code: 1, compile_time: 0.5, execution_time: null }) })).toBe('compile error')
    expect(outcome({ status: 'failed', result: result({ exit_code: 1, compile_time: 0.5, execution_time: 0.02 }) })).toBe('failed')
    expect(outcome({ status: 'timeout', result: result({}) })).toBe('timeout')
    expect(outcome({ status: 'running', result: null })).toBe('running')
    expect(isTruncated(result({ stdout: 'x\n[output truncated: exceeded 65536 bytes]' }))).toBe(true)
  })

  it('formats relative times', async () => {
    const { formatRelative } = await import('../lib/jobs')
    const now = Date.parse('2026-10-13T12:00:00Z')
    expect(formatRelative('2026-10-13T11:59:30Z', now)).toBe('just now')
    expect(formatRelative('2026-10-13T11:45:00Z', now)).toBe('15 min ago')
    expect(formatRelative('2026-10-13T09:00:00Z', now)).toBe('3 h ago')
  })
})

describe('theme', () => {
  it('resolves system preference', async () => {
    const { resolveTheme } = await import('../lib/theme')
    expect(resolveTheme('light', 'dark')).toBe('light')
    expect(resolveTheme('dark', 'light')).toBe('dark')
    expect(resolveTheme('system', 'light')).toBe('light')
    expect(resolveTheme('system', 'dark')).toBe('dark')
  })
})
