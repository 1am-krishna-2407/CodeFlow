import { ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eraser, ExternalLink, Keyboard, Loader2, Terminal } from 'lucide-react'
import type { JobDetail } from '../services/api'
import { formatSeconds, isTerminal, isTruncated, outcome } from '../lib/jobs'
import { Banner, cn, CopyButton, EmptyState, IconButton, Kbd, MetricChip, StatusBadge } from './ui'

export type OutputTab = 'output' | 'errors' | 'input'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const RUN_SHORTCUT = isMac ? '⌘ Enter' : 'Ctrl Enter'

export default function OutputPanel({
  job, submitting = false, submitError, onDismissError, stdin, onStdinChange, readOnlyInput = false, onClear,
  showDetailsLink = true,
}: {
  job: JobDetail | null
  submitting?: boolean
  submitError?: string
  onDismissError?: () => void
  stdin: string
  onStdinChange?: (value: string) => void
  readOnlyInput?: boolean
  onClear?: () => void
  showDetailsLink?: boolean
}) {
  const [tab, setTab] = useState<OutputTab>('output')
  const result = job?.result ?? null
  const finished = !!job && isTerminal(job.status)
  const busy = submitting || (!!job && !finished)
  const stdout = result?.stdout ?? ''
  const stderr = result?.stderr ?? ''
  const what = job ? outcome(job) : null

  // When a run finishes, jump to whichever stream has something to show.
  const settled = useRef<string | null>(null)
  useEffect(() => {
    if (!job || !finished || settled.current === job.id) return
    settled.current = job.id
    setTab(stderr && !stdout ? 'errors' : 'output')
  }, [job, finished, stdout, stderr])

  const tabs: { id: OutputTab; label: string; badge?: ReactNode }[] = [
    { id: 'output', label: 'Output' },
    { id: 'errors', label: 'Errors', badge: stderr ? <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="has errors" /> : null },
    { id: 'input', label: 'Input', badge: stdin ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="has input" /> : null },
  ]

  const copyText = tab === 'output' ? stdout : tab === 'errors' ? stderr : stdin

  return (
    <section aria-label="Run output" className="flex h-full min-h-0 flex-col bg-editor">
      {/* status bar */}
      <div className="relative flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
        {what ? <StatusBadge outcome={what} /> : submitting ? <StatusBadge outcome="queued" /> : (
          <span className="text-xs text-muted">Ready</span>
        )}
        {finished && result && (
          <>
            <MetricChip label="Exit" value={result.exit_code ?? '–'} />
            {result.compile_time != null && <MetricChip label="Compile" value={formatSeconds(result.compile_time)} />}
            {result.execution_time != null && <MetricChip label="Run" value={formatSeconds(result.execution_time)} />}
          </>
        )}
        {job && (
          <div className="ml-auto flex items-center gap-0.5">
            <CopyButton text={job.id} label={`Copy job ID ${job.id.slice(0, 8)}`} />
            {showDetailsLink && (
              <Link to={`/runs/${job.id}`} aria-label="Open run details" title="Open run details"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg">
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
        {busy && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden>
            <div className="animate-indeterminate h-full w-1/3 bg-running" />
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="flex h-9 shrink-0 items-center border-b border-line bg-surface px-1.5">
        <div role="tablist" aria-label="Output streams" className="flex h-full">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn('relative flex h-full items-center gap-1.5 px-3 text-[13px] font-medium transition-colors',
                tab === t.id ? 'text-fg' : 'text-muted hover:text-fg')}>
              {t.label}{t.badge}
              {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center">
          <CopyButton text={copyText} label={`Copy ${tab}`} />
          {onClear && (
            <IconButton label="Clear output" onClick={onClear} disabled={!job || busy}>
              <Eraser className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      {/* notices */}
      <div className="shrink-0 space-y-2 empty:hidden [&:not(:empty)]:p-3 [&:not(:empty)]:pb-0">
        {submitError && <Banner kind="error" onClose={onDismissError}>{submitError}</Banner>}
        {finished && what === 'compile error' && tab !== 'errors' && (
          <Banner kind="error">Compilation failed. <button className="font-medium underline" onClick={() => setTab('errors')}>See errors</button></Banner>
        )}
        {finished && what === 'timeout' && <Banner kind="warning">The program was stopped at the time limit. Any output it produced before that is shown.</Banner>}
        {finished && what === 'memory limit' && <Banner kind="warning">The program ran out of memory and was stopped.</Banner>}
        {finished && isTruncated(result) && <Banner kind="info">Output was longer than 64 KB and has been truncated.</Banner>}
      </div>

      {/* content */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {tab === 'input' ? (
          <div className="flex h-full flex-col p-3">
            <label htmlFor="stdin" className="mb-2 text-xs text-muted">
              Program input (stdin){readOnlyInput ? '' : ', sent to your program when you press Run'}
            </label>
            <textarea id="stdin" value={stdin} onChange={(e) => onStdinChange?.(e.target.value)} readOnly={readOnlyInput || busy}
              spellCheck={false} placeholder={readOnlyInput ? 'No input' : 'Type input lines here…'}
              className="min-h-32 flex-1 resize-none rounded-md border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed text-fg outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        ) : !job ? (
          submitting ? <Waiting label="Submitting…" /> : (
            <EmptyState icon={<Terminal className="h-5 w-5" />} title="Press Run to execute your code">
              <span className="inline-flex items-center gap-1.5"><Keyboard className="h-3.5 w-3.5" /> or press <Kbd>{RUN_SHORTCUT}</Kbd></span>
            </EmptyState>
          )
        ) : !finished ? (
          <Waiting label={job.status === 'queued' ? 'Waiting for a free sandbox…' : 'Running in the sandbox…'} />
        ) : (
          <Stream key={`${job.id}-${tab}`} text={tab === 'output' ? stdout : stderr} error={tab === 'errors'}
            empty={tab === 'output' ? 'The program produced no output.' : 'No errors.'} />
        )}
      </div>
    </section>
  )
}

function Waiting({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  )
}

function Stream({ text, empty, error }: { text: string; empty: string; error?: boolean }) {
  if (!text) return <p className="p-4 font-mono text-[13px] italic text-muted">{empty}</p>
  return (
    <pre className={cn('animate-flash min-h-full whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed',
      error ? 'text-danger' : 'text-fg')}>{text}</pre>
  )
}
