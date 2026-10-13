import { useEffect, useRef, useState } from 'react'
import { getApiErrorMessage, getJob, JobDetail } from '../services/api'
import { isTerminal, nextPollDelay } from './jobs'

const MAX_CONSECUTIVE_ERRORS = 5

/**
 * Loads a job and keeps polling it until it reaches a terminal status. A single failed poll is
 * retried rather than reported, so a network blip doesn't make a running job look broken.
 */
export function usePollJob(jobId: string | null) {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setJob(null)
    setError('')
    if (!jobId) return

    let cancelled = false
    let delay: number | null = null
    let failures = 0

    const poll = async () => {
      try {
        const latest = await getJob(jobId)
        if (cancelled) return
        failures = 0
        setJob(latest)
        setError('')
        if (isTerminal(latest.status)) return
      } catch (err) {
        if (cancelled) return
        failures += 1
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 404 || failures >= MAX_CONSECUTIVE_ERRORS) {
          setError(status === 404 ? 'Job not found.' : getApiErrorMessage(err, 'Unable to load job status.'))
          return
        }
      }
      delay = nextPollDelay(delay)
      timer.current = setTimeout(poll, delay)
    }

    poll()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [jobId])

  return { job, error }
}
