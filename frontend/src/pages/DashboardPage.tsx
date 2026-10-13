import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CircleCheck, CircleX, Clock, FolderOpen, Hourglass, Loader2, Play, Plus, Sigma, Terminal, Trash2,
} from 'lucide-react'
import {
  createProject, deleteProject, getApiErrorMessage, getJobs, getProjects, getStats, JobSummary, Project, Stats,
} from '../services/api'
import { AppShell, PageTitle } from '../components/AppShell'
import { Banner, Button, ButtonLink, Card, EmptyState, IconButton, Skeleton, StatusBadge, cn } from '../components/ui'
import { formatRelative, languageLabel } from '../lib/jobs'
import { useFeedback } from '../lib/feedback'
import { useSession } from '../lib/session'

const TILES: { key: keyof Stats; label: string; icon: typeof Sigma; tone: string }[] = [
  { key: 'total', label: 'Total runs', icon: Sigma, tone: 'text-fg' },
  { key: 'success', label: 'Succeeded', icon: CircleCheck, tone: 'text-success' },
  { key: 'failed', label: 'Failed', icon: CircleX, tone: 'text-danger' },
  { key: 'timeout', label: 'Timed out', icon: Clock, tone: 'text-warning' },
  { key: 'running', label: 'Running', icon: Loader2, tone: 'text-running' },
  { key: 'queued', label: 'Queued', icon: Hourglass, tone: 'text-info' },
]

export default function DashboardPage() {
  const { user } = useSession()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<JobSummary[] | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const { confirm, toast } = useFeedback()

  const load = useCallback(() => {
    Promise.all([getStats(), getJobs({ limit: 6 }), getProjects()])
      .then(([s, jobs, p]) => {
        setStats(s)
        setRecent(jobs.items)
        setProjects(p)
        setError('')
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Unable to load your dashboard.')))
  }, [])

  useEffect(load, [load])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const project = await createProject({ name, description: description || null })
      setProjects((prev) => [project, ...(prev ?? [])])
      setName('')
      setDescription('')
      toast(`Project "${project.name}" created`, 'success')
    } catch (err) {
      toast(getApiErrorMessage(err, 'Could not create the project.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (project: Project) => {
    const ok = await confirm({
      title: `Delete "${project.name}"?`, message: 'Its runs are kept but will no longer belong to a project.',
      confirmLabel: 'Delete project', danger: true,
    })
    if (!ok) return
    try {
      await deleteProject(project.id)
      setProjects((prev) => (prev ?? []).filter((p) => p.id !== project.id))
      toast('Project deleted', 'success')
    } catch (err) {
      toast(getApiErrorMessage(err, 'Could not delete the project.'), 'error')
    }
  }

  const firstName = user?.name?.split(' ')[0]

  return (
    <AppShell>
      <PageTitle title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'} subtitle="Your runs at a glance."
        actions={<ButtonLink to="/workspace" variant="primary"><Play className="h-4 w-4" /> New run</ButtonLink>} />

      {error && <Banner kind="error" className="mb-6">{error}</Banner>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map(({ key, label, icon: Icon, tone }) => (
          <Card key={key} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              {label}
              <Icon className={cn('h-4 w-4', tone)} aria-hidden />
            </div>
            {stats ? (
              <p className={cn('mt-2 font-mono text-2xl font-semibold', key === 'total' ? 'text-fg' : tone)}>{stats[key]}</p>
            ) : (
              <Skeleton className="mt-3 h-6 w-10" />
            )}
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Recent runs</h2>
            <Link to="/history" className="text-[13px] font-medium text-primary hover:underline">View all</Link>
          </div>
          {!recent ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : recent.length === 0 ? (
            <EmptyState icon={<Terminal className="h-5 w-5" />} title="No runs yet"
              action={<ButtonLink to="/workspace" variant="primary" size="sm">Open the workspace</ButtonLink>}>
              Your latest runs will appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((job) => (
                <li key={job.id}>
                  <Link to={`/runs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-raised/60">
                    <StatusBadge outcome={job.status} className="w-[108px] justify-center" />
                    <span className="w-24 shrink-0">{languageLabel(job.language)}</span>
                    <span className="font-mono text-muted">{job.id.slice(0, 8)}</span>
                    <span className="ml-auto text-xs text-muted">{formatRelative(job.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Projects</h2>
            <p className="mt-0.5 text-xs text-muted">Group related runs. Pick a project in the workspace toolbar.</p>
          </div>
          <form onSubmit={handleCreate} className="space-y-2 border-b border-line p-4">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={256} required placeholder="Project name"
              aria-label="Project name"
              className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25" />
            <div className="flex gap-2">
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}
                placeholder="Description (optional)" aria-label="Project description"
                className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25" />
              <Button type="submit" variant="primary" loading={saving} disabled={!name.trim()} icon={<Plus className="h-4 w-4" />}>Add</Button>
            </div>
          </form>
          {!projects ? (
            <div className="space-y-3 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : projects.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">No projects yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <FolderOpen className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <Link to={`/history?project_id=${p.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-[13px] font-medium">{p.name}</span>
                    {p.description && <span className="block truncate text-xs text-muted">{p.description}</span>}
                  </Link>
                  <IconButton label={`Delete project ${p.name}`} className="hover:text-danger" onClick={() => handleDelete(p)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  )
}
