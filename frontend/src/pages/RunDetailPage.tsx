import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileCode, SquarePen, Trash2 } from 'lucide-react'
import { FullShell } from '../components/AppShell'
import CodeEditor from '../components/CodeEditor'
import OutputPanel from '../components/OutputPanel'
import { SplitLayout } from '../components/SplitLayout'
import { Banner, Button, CopyButton, Spinner, StatusBadge } from '../components/ui'
import { deleteJob, getApiErrorMessage } from '../services/api'
import { formatDate, languageInfo, outcome } from '../lib/jobs'
import { useFeedback } from '../lib/feedback'
import { usePollJob } from '../lib/usePollJob'

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { job, error } = usePollJob(id ?? null)
  const [mobileTab, setMobileTab] = useState<'code' | 'output'>('output')
  const [deleting, setDeleting] = useState(false)
  const { confirm, toast } = useFeedback()
  const navigate = useNavigate()

  const handleDelete = async () => {
    if (!job) return
    const ok = await confirm({ title: 'Delete this run?', message: 'Its code, input and output will be removed permanently.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    setDeleting(true)
    try {
      await deleteJob(job.id)
      toast('Run deleted', 'success')
      navigate('/history')
    } catch (err) {
      toast(getApiErrorMessage(err, 'Could not delete the run.'), 'error')
      setDeleting(false)
    }
  }

  const lang = job ? languageInfo(job.language) : null

  return (
    <FullShell>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <Link to="/history" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> History
        </Link>
        {job && lang && (
          <>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[13px]" title={job.id}>{job.id.slice(0, 8)}</span>
              <CopyButton text={job.id} label="Copy job ID" />
            </div>
            <StatusBadge outcome={outcome(job)} />
            <span className="text-[13px] text-muted">{lang.label}</span>
            <dl className="hidden items-center gap-4 text-xs text-muted lg:flex">
              <div className="flex gap-1"><dt>Queued</dt><dd className="text-fg">{formatDate(job.created_at)}</dd></div>
              <div className="flex gap-1"><dt>Started</dt><dd className="text-fg">{job.started_at ? formatDate(job.started_at) : 'Pending'}</dd></div>
              <div className="flex gap-1"><dt>Finished</dt><dd className="text-fg">{job.completed_at ? formatDate(job.completed_at) : 'Pending'}</dd></div>
            </dl>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" icon={<SquarePen className="h-4 w-4" />}
                onClick={() => navigate('/workspace', { state: { language: job.language, source: job.source_code, stdin: job.stdin } })}>
                Open in editor
              </Button>
              {job.status !== 'running' && (
                <Button size="sm" variant="ghost" loading={deleting} icon={<Trash2 className="h-4 w-4" />} onClick={handleDelete}
                  className="hover:text-danger">
                  Delete
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {error ? (
        <div className="p-6"><Banner kind="error">{error}</Banner></div>
      ) : !job || !lang ? (
        <div className="flex flex-1 items-center justify-center"><Spinner className="h-5 w-5" /></div>
      ) : (
        <SplitLayout
          storageKey="codeflow-split"
          mobileTab={mobileTab}
          onMobileTabChange={setMobileTab}
          left={
            <div className="flex h-full flex-col bg-editor">
              <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-3 font-mono text-[12.5px]">
                <FileCode className="h-3.5 w-3.5 text-muted" aria-hidden /> {lang.filename}
                <span className="ml-2 font-sans text-xs text-muted">read-only</span>
              </div>
              <div className="min-h-0 flex-1">
                <CodeEditor language={lang.monaco} value={job.source_code} readOnly ariaLabel="Submitted source code" />
              </div>
            </div>
          }
          right={<OutputPanel job={job} stdin={job.stdin ?? ''} readOnlyInput showDetailsLink={false} />}
        />
      )}
    </FullShell>
  )
}
