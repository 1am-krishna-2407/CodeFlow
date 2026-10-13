import { ReactNode, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, Code2, History, LayoutDashboard, LogOut } from 'lucide-react'
import { useSession } from '../lib/session'
import { cn, Logo, ThemeToggle } from './ui'

const NAV = [
  { to: '/workspace', label: 'Workspace', icon: Code2 },
  { to: '/history', label: 'History', icon: History },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b sm:gap-4 border-line bg-surface px-3 sm:px-4">
      <div className="sm:hidden"><Logo to="/workspace" compact /></div>
      <div className="hidden sm:block"><Logo to="/workspace" /></div>
      <nav className="flex items-center gap-0.5" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={label}
            className={({ isActive }) => cn(
              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
              isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised hover:text-fg',
            )}>
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden sm:block"><ThemeToggle /></div>
        <UserMenu />
      </div>
    </header>
  )
}

function UserMenu() {
  const { user, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="flex h-8 items-center gap-1 rounded-md pl-1 pr-1.5 text-muted hover:bg-raised hover:text-fg">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{initial}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-60 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-medium">{user?.name ?? 'Signed in'}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <div className="flex items-center justify-between border-b border-line px-3 py-2 sm:hidden">
            <span className="text-xs text-muted">Theme</span>
            <ThemeToggle />
          </div>
          <button role="menuitem" onClick={() => signOut()}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

/** Standard page: top bar plus a scrolling, width-constrained content column. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}

/** Full-bleed page (workspace, run details): top bar plus a viewport-filling body. */
export function FullShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
