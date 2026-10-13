import type { JobResult, JobStatus, JobSummary, Language } from '../services/api'

export const TERMINAL_STATUSES: JobStatus[] = ['completed', 'failed', 'timeout']

export const isTerminal = (status: string) => (TERMINAL_STATUSES as string[]).includes(status)

export const LANGUAGES: { value: Language; label: string; filename: string; monaco: string }[] = [
  { value: 'python', label: 'Python 3.11', filename: 'main.py', monaco: 'python' },
  { value: 'java', label: 'Java 17', filename: 'Main.java', monaco: 'java' },
  { value: 'cpp', label: 'C++17', filename: 'main.cpp', monaco: 'cpp' },
]

export const languageInfo = (value: string) => LANGUAGES.find((l) => l.value === value) ?? LANGUAGES[0]

export const languageLabel = (value: string) => LANGUAGES.find((l) => l.value === value)?.label ?? value

/** What actually happened, which is finer-grained than the stored status. */
export type Outcome = JobStatus | 'compile error' | 'memory limit'

export const outcome = (job: { status: JobStatus; result?: JobResult | null }): Outcome => {
  const r = job.result
  if (job.status === 'failed' && r) {
    if ((r.stderr || '').includes('Memory limit exceeded')) return 'memory limit'
    if (r.compile_time != null && r.execution_time == null) return 'compile error'
  }
  return job.status
}

/** Kept for callers that only need the label. */
export const displayStatus = outcome

export const isTruncated = (r: JobResult | null | undefined) =>
  !!r && [r.stdout, r.stderr].some((s) => (s || '').includes('[output truncated'))

export const formatSeconds = (seconds: number | null | undefined) => {
  if (seconds == null) return '–'
  return seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(2)} s`
}

export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '–')

export const formatRelative = (iso: string, now = Date.now()) => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

/** Wall-clock time from pickup to completion, available on list rows without loading results. */
export const wallDuration = (job: Pick<JobSummary, 'started_at' | 'completed_at'>) =>
  job.started_at && job.completed_at
    ? (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000
    : null

/** Polling schedule: quick at first (most jobs finish in about a second), backing off to a 5 s ceiling. */
export const nextPollDelay = (previousMs: number | null) =>
  previousMs === null ? 500 : Math.min(Math.round(previousMs * 1.5), 5000)

export const shortId = (job: Pick<JobSummary, 'id'>) => job.id.slice(0, 8)
