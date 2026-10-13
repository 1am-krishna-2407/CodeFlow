import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FolderOpen, History, Play, RotateCw, Trash2, X } from 'lucide-react'
import { deleteJob, getApiErrorMessage, getJobs, getProjects, JobPage, JobStatus, Language, Project } from '../services/api'
import { AppShell, PageTitle } from '../components/AppShell'
import { Banner, ButtonLink, Card, EmptyState, IconButton, Select, Skeleton, StatusBadge } from '../components/ui'
import { formatRelative, formatSeconds, formatDate, LANGUAGES, languageLabel, wallDuration } from '../lib/jobs'
import { useFeedback } from '../lib/feedback'

const PAGE_SIZE = 20
const STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'timeout', label: 'Timed out' },
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
]

export default function HistoryPage() {
  // Filters live in the URL so they survive reloads and can be linked to (e.g. from a project).
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') || '') as JobStatus | ''
  const language = (params.get('language') || '') as Language | ''
  const projectId = params.get('project_id') || ''
  const page = Math.max(0, Number(params.get('page') || 0) || 0)

  const [data, setData] = useState<JobPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const { confirm, toast } = useFeedback()
  const navigate = useNavigate()

  const fetchJobs = useCallback(() => {
    setLoading(true)
    getJobs({
      skip: page * PAGE_SIZE, limit: PAGE_SIZE,
      status: status || undefined, language: language || undefined, project_id: projectId || undefined,
    })
      .then((res) => {
        setData(res)
        setError('')
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Unable to load your runs.')))
      .finally(() => setLoading(false))
  }, [page, status, language, projectId])

  useEffect(fetchJobs, [fetchJobs])
  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in changes)) next.delete('page') // a new filter starts from the first page
    setParams(next)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: 'Delete this run?', message: 'Its code, input and output will be removed permanently.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await deleteJob(id)
      toast('Run deleted', 'success')
      fetchJobs()
    } catch (err) {
      toast(getApiErrorMessage(err, 'Could not delete the run.'), 'error')
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const project = projects.find((p) => p.id === projectId)
  const filtered = !!(status || language || projectId)

  return (
    <AppShell>
      <PageTitle title="History" subtitle="Every run you have submitted."
        actions={<ButtonLink to="/workspace" variant="primary"><Play className="h-4 w-4" /> New run</ButtonLink>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value })} className="w-auto">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select aria-label="Filter by language" value={language} onChange={(e) => update({ language: e.target.value })} className="w-auto">
          <option value="">All languages</option>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </Select>
        {projectId && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 pl-3 pr-1 text-[13px] text-accent">
            <FolderOpen className="h-3.5 w-3.5" /> {project?.name ?? 'Project'}
            <button aria-label="Remove project filter" onClick={() => update({ project_id: '' })}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent/15"><X className="h-3.5 w-3.5" /></button>
          </span>
        )}
        <IconButton label="Refresh" onClick={fetchJobs} className="ml-auto"><RotateCw className="h-4 w-4" /></IconButton>
      </div>

      {error && <Banner kind="error" className="mb-4">{error}</Banner>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-line bg-raised/60 text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Run</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Language</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Submitted</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Duration</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && !data
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      {['w-16', 'w-20', 'w-24', 'w-24', 'w-12', 'w-6'].map((w, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className={`h-4 ${w}`} /></td>
                      ))}
                    </tr>
                  ))
                : data?.items.map((job) => (
                    <tr key={job.id} onClick={() => navigate(`/runs/${job.id}`)} className="cursor-pointer transition-colors hover:bg-raised/60">
                      <td className="px-4 py-2.5">
                        <Link to={`/runs/${job.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-accent hover:underline" title={job.id}>
                          {job.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{languageLabel(job.language)}</td>
                      <td className="px-4 py-2.5"><StatusBadge outcome={job.status} /></td>
                      <td className="px-4 py-2.5 text-muted" title={formatDate(job.created_at)}>{formatRelative(job.created_at)}</td>
                      <td className="px-4 py-2.5 font-mono text-muted">{formatSeconds(wallDuration(job))}</td>
                      <td className="px-2 py-1.5 text-right">
                        {job.status !== 'running' && (
                          <IconButton label="Delete run" className="hover:text-danger"
                            onClick={(e) => { e.stopPropagation(); handleDelete(job.id) }}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {data && data.items.length === 0 && (
          <EmptyState icon={<History className="h-5 w-5" />} title={filtered ? 'No runs match these filters' : 'No runs yet'}
            action={filtered
              ? <button className="text-sm font-medium text-primary hover:underline" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
              : <ButtonLink to="/workspace" variant="primary"><Play className="h-4 w-4" /> Run your first program</ButtonLink>}>
            {filtered ? 'Try a different status, language or project.' : 'Code you run in the workspace shows up here.'}
          </EmptyState>
        )}
      </Card>

      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
          <span>{data.total} run{data.total === 1 ? '' : 's'} · page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <IconButton label="Previous page" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton label="Next page" disabled={page + 1 >= totalPages} onClick={() => update({ page: String(page + 1) })}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      )}
    </AppShell>
  )
}
