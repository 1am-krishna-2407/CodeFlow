import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileCode, Play } from 'lucide-react'
import { createJob, getApiErrorMessage, getProjects, Language, Project } from '../services/api'
import { FullShell } from '../components/AppShell'
import CodeEditor from '../components/CodeEditor'
import OutputPanel, { RUN_SHORTCUT } from '../components/OutputPanel'
import { SplitLayout } from '../components/SplitLayout'
import { Button, Kbd, Select } from '../components/ui'
import { isTerminal, languageInfo, LANGUAGES, outcome } from '../lib/jobs'
import { usePollJob } from '../lib/usePollJob'

export const TEMPLATES: Record<Language, string> = {
  python: `name = input("What's your name? ")\nprint(f"Hello, {name}!")\n`,
  java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.println("Hello, " + in.nextLine() + "!");\n    }\n}\n`,
  cpp: `#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    std::getline(std::cin, name);\n    std::cout << "Hello, " << name << "!" << std::endl;\n    return 0;\n}\n`,
}

const DRAFT_KEY = 'codeflow-draft'

interface Draft {
  language: Language
  code: Record<Language, string>
  stdin: string
}

const loadDraft = (): Draft => {
  const fallback: Draft = { language: 'python', code: { ...TEMPLATES }, stdin: 'CodeFlow\n' }
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (saved && LANGUAGES.some((l) => l.value === saved.language)) {
      return { language: saved.language, code: { ...TEMPLATES, ...saved.code }, stdin: saved.stdin ?? '' }
    }
  } catch {
    // corrupt or unavailable storage: start fresh
  }
  return fallback
}

interface OpenInEditorState {
  language?: Language
  source?: string
  stdin?: string | null
}

export default function WorkspacePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => {
    const base = loadDraft()
    const incoming = location.state as OpenInEditorState | null
    if (incoming?.language && incoming.source != null) {
      return { language: incoming.language, code: { ...base.code, [incoming.language]: incoming.source }, stdin: incoming.stdin ?? '' }
    }
    return base
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [mobileTab, setMobileTab] = useState<'code' | 'output'>('code')
  const { job, error: pollError } = usePollJob(jobId)

  // Drop the router state once consumed so a reload doesn't re-apply it.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // drafts just won't survive a reload
    }
  }, [draft])

  const lang = languageInfo(draft.language)
  const code = draft.code[draft.language]
  const running = submitting || (!!job && !isTerminal(job.status) && !pollError)

  const run = useCallback(async () => {
    if (running || !code.trim()) return
    setSubmitError('')
    setSubmitting(true)
    setMobileTab('output')
    try {
      const res = await createJob({
        project_id: projectId || null, language: draft.language, source_code: code, stdin: draft.stdin || null,
      })
      setJobId(res.job_id)
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Could not submit your code.'))
    } finally {
      setSubmitting(false)
    }
  }, [running, code, projectId, draft.language, draft.stdin])

  // Ctrl/Cmd+Enter anywhere on the page (the editor registers its own binding too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.defaultPrevented) {
        e.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  const runButton = (className = '') => (
    <Button variant="primary" onClick={run} loading={running} disabled={!code.trim()} icon={<Play className="h-4 w-4" />}
      className={className} title={`Run (${RUN_SHORTCUT})`}>
      {running ? 'Running' : 'Run'}
      {!running && <span className="ml-1 hidden whitespace-nowrap rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px] lg:inline">{RUN_SHORTCUT}</span>}
    </Button>
  )

  const hasErrors = !!job?.result?.stderr
  const outcomeDot = job && isTerminal(job.status) ? (
    <span className={`h-1.5 w-1.5 rounded-full ${outcome(job) === 'completed' ? 'bg-success' : 'bg-danger'}`} />
  ) : null

  return (
    <FullShell>
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <label className="sr-only" htmlFor="language">Language</label>
        <Select id="language" value={draft.language} className="w-auto"
          onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value as Language }))}>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </Select>
        {projects.length > 0 && (
          <>
            <label className="sr-only" htmlFor="project">Project</label>
            <Select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="hidden w-auto max-w-[180px] sm:block">
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </>
        )}
        <div className="ml-auto hidden md:block">{runButton()}</div>
      </div>

      <SplitLayout
        storageKey="codeflow-split"
        mobileTab={mobileTab}
        onMobileTabChange={setMobileTab}
        rightBadge={outcomeDot || (hasErrors ? <span className="h-1.5 w-1.5 rounded-full bg-danger" /> : null)}
        left={
          <div className="flex h-full flex-col bg-editor">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
              <span className="flex h-full items-center gap-1.5 border-b-2 border-primary font-mono text-[12.5px]">
                <FileCode className="h-3.5 w-3.5 text-muted" aria-hidden /> {lang.filename}
              </span>
              {draft.language === 'java' && (
                <span className="truncate text-xs text-muted">Your class must be named <code className="font-mono text-fg">Main</code></span>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor language={lang.monaco} value={code} onRun={run}
                onChange={(v) => setDraft((d) => ({ ...d, code: { ...d.code, [d.language]: v } }))} />
            </div>
          </div>
        }
        right={
          <OutputPanel
            job={job}
            submitting={submitting}
            submitError={submitError || pollError}
            onDismissError={() => setSubmitError('')}
            stdin={draft.stdin}
            onStdinChange={(v) => setDraft((d) => ({ ...d, stdin: v }))}
            onClear={() => setJobId(null)}
          />
        }
      />

      {/* phones: keep Run reachable */}
      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface p-2 md:hidden">
        <span className="flex-1 truncate text-xs text-muted">{lang.label} · <Kbd>{RUN_SHORTCUT}</Kbd></span>
        {runButton('w-32')}
      </div>
    </FullShell>
  )
}
