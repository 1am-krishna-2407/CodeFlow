import { Link } from 'react-router-dom'
import {
  ArrowRight, Clock, Cpu, FileCode, History, Keyboard, Lock, Play, ShieldCheck, Terminal, Timer, WifiOff,
} from 'lucide-react'
import { ButtonLink, Logo, StatusBadge, ThemeToggle, MetricChip } from '../components/ui'
import { useSession } from '../lib/session'

const FEATURES = [
  { icon: ShieldCheck, title: 'A fresh sandbox for every run', body: 'Each program runs in its own throwaway container that is destroyed as soon as it finishes.' },
  { icon: Keyboard, title: 'Real stdin', body: 'Give your program input just as you would in a terminal, then read it with input(), Scanner or std::cin.' },
  { icon: Timer, title: 'Compile and run time, separately', body: 'See how long the compiler took and how long your program actually ran, measured inside the sandbox.' },
  { icon: History, title: 'Full run history', body: 'Every run is saved with its code, input and output, so you can reopen and re-run it later.' },
]

const STEPS = [
  { icon: FileCode, title: 'Write', body: 'Pick Python, Java or C++ and write code in a full editor.' },
  { icon: Play, title: 'Run', body: 'Press Run or Ctrl+Enter. Your code is queued and run in an isolated sandbox.' },
  { icon: Terminal, title: 'Inspect', body: 'Read stdout and stderr side by side with your code, along with the exit code and timings.' },
]

const LIMITS = [
  { icon: WifiOff, label: 'No network access' },
  { icon: Cpu, label: '1 CPU, memory capped' },
  { icon: Clock, label: '10 second time limit' },
  { icon: Lock, label: 'Read-only filesystem, unprivileged user' },
]

export default function LandingPage() {
  const { authed } = useSession()
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-5 text-[13px] text-muted md:flex">
            <a href="#features" className="hover:text-fg">Features</a>
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#security" className="hover:text-fg">Security</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {authed ? (
              <ButtonLink to="/workspace" variant="primary" size="sm">Open workspace <ArrowRight className="h-4 w-4" /></ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Log in</ButtonLink>
                <ButtonLink to="/register" variant="primary" size="sm">Start coding</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_center,rgb(var(--primary)/0.14),transparent_65%)]" />
          <div className="relative mx-auto max-w-[1200px] px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Python 3.11 · Java 17 · C++17
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-[56px] sm:leading-[1.05]">
              Write. Run. See the output <span className="text-primary">in a secure sandbox.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
              An online compiler for quick experiments, interview practice and real debugging, with no setup.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to={authed ? '/workspace' : '/register'} variant="primary" size="lg">
                Start coding <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              {!authed && <ButtonLink to="/login" size="lg">Log in</ButtonLink>}
            </div>
            <HeroWorkspace />
          </div>
        </section>

        {/* languages */}
        <section aria-label="Supported languages" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-6 sm:px-6">
            {[
              { mono: 'Py', name: 'Python 3.11', cls: 'bg-info/15 text-info' },
              { mono: 'Jv', name: 'Java 17', cls: 'bg-warning/15 text-warning' },
              { mono: 'C+', name: 'C++17 · GCC 13', cls: 'bg-accent/15 text-accent' },
            ].map((l) => (
              <div key={l.name} className="flex items-center gap-2.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-md font-mono text-xs font-bold ${l.cls}`}>{l.mono}</span>
                <span className="text-sm font-medium">{l.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* features */}
        <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-[28px]">Everything you need to run a snippet. Nothing you don&apos;t.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-line bg-surface p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-[28px]">How it works</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="relative rounded-lg border border-line bg-canvas p-6">
                  <span className="font-mono text-xs text-muted">0{i + 1}</span>
                  <div className="mt-3 flex items-center gap-2.5">
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                    <h3 className="text-lg font-semibold">{title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* security */}
        <section id="security" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 rounded-lg border border-line bg-surface p-8 md:grid-cols-[1.1fr_1fr] md:p-12">
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success/10 text-success"><ShieldCheck className="h-5 w-5" /></span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">Run untrusted code without worry</h2>
              <p className="mt-3 text-sm text-muted">
                Every run gets a brand-new, locked-down container that is thrown away afterwards. Nothing is shared
                between runs or users, and runaway programs are stopped automatically.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {LIMITS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5 rounded-md border border-line bg-canvas px-3 py-2.5 text-[13px]">
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Ready to run something?</h2>
            <ButtonLink to={authed ? '/workspace' : '/register'} variant="primary" size="lg" className="mt-6">
              Start coding <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-6 text-[13px] text-muted sm:px-6">
          <Logo />
          <nav className="flex gap-5">
            <a href="#features" className="hover:text-fg">Features</a>
            <a href="#security" className="hover:text-fg">Security</a>
            <Link to="/login" className="hover:text-fg">Log in</Link>
            <Link to="/register" className="hover:text-fg">Sign up</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

/** Static miniature of the workspace (not interactive), showing a real-looking Java run. */
function HeroWorkspace() {
  const k = 'text-accent'
  const s = 'text-primary'
  const n = 'text-warning'
  const c = 'italic text-muted'
  const lines = [
    <><span className={k}>import</span> java.util.Scanner;</>,
    <>{' '}</>,
    <><span className={k}>public class</span> Main {'{'}</>,
    <>    <span className={c}>// first n Fibonacci numbers</span></>,
    <>    <span className={k}>public static void</span> main(String[] args) {'{'}</>,
    <>        <span className={k}>int</span> n = <span className={k}>new</span> Scanner(System.in).nextInt();</>,
    <>        <span className={k}>long</span> a = <span className={n}>0</span>, b = <span className={n}>1</span>;</>,
    <>        <span className={k}>for</span> (<span className={k}>int</span> i = <span className={n}>0</span>; i &lt; n; i++) {'{'}</>,
    <>            System.out.print(a + <span className={s}>" "</span>);</>,
    <>            <span className={k}>long</span> t = a + b; a = b; b = t;</>,
    <>        {'}'}</>,
    <>    {'}'}</>,
    <>{'}'}</>,
  ]
  return (
    <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-lg border border-line bg-surface text-left shadow-2xl shadow-black/20">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-3 font-mono text-xs text-muted">Main.java</span>
        <span className="ml-auto inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-semibold text-on-primary">
          <Play className="h-3 w-3" /> Run
        </span>
      </div>
      <div className="grid md:grid-cols-[1.5fr_1fr]">
        <pre aria-label="Example Java program" className="overflow-x-auto bg-editor p-4 font-mono text-[12px] leading-[1.7] sm:text-[12.5px]">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre"><span className="mr-4 inline-block w-4 select-none text-right text-muted/60">{i + 1}</span>{line}</div>
          ))}
        </pre>
        <div className="flex flex-col border-t border-line bg-editor md:border-l md:border-t-0">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
            <StatusBadge outcome="completed" />
            <MetricChip label="Compile" value="0.6 s" />
            <MetricChip label="Run" value="82 ms" />
          </div>
          <div className="flex gap-4 border-b border-line bg-surface px-3 text-xs">
            <span className="border-b-2 border-primary py-2 font-medium">Output</span>
            <span className="py-2 text-muted">Errors</span>
            <span className="py-2 text-muted">Input</span>
          </div>
          <pre className="flex-1 whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-relaxed">0 1 1 2 3 5 8 13 21 34</pre>
          <div className="border-t border-line px-3 py-2 font-mono text-[11px] text-muted">stdin: 10</div>
        </div>
      </div>
    </div>
  )
}
