import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Check, CircleCheck, CircleX, Clock, Copy, FileCode, Hourglass, Info, Loader2, MemoryStick, Monitor,
  Moon, Sun, X,
} from 'lucide-react'
import type { Outcome } from '../lib/jobs'
import { ThemePreference, useTheme } from '../lib/theme'

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- buttons */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-fg hover:bg-raised',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger/90 dark:text-canvas',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-9 px-4 text-sm gap-2', lg: 'h-11 px-5 text-[15px] gap-2' }
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-fg disabled:opacity-40', className)}
      {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({ to, variant = 'secondary', size = 'md', children, className }: {
  to: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; children: ReactNode; className?: string
}) {
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-9 px-4 text-sm gap-2', lg: 'h-11 px-5 text-[15px] gap-2' }
  return (
    <Link to={to} className={cn('inline-flex items-center justify-center rounded-md font-medium transition-colors', VARIANTS[variant], sizes[size], className)}>
      {children}
    </Link>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted">{children}</kbd>
  )
}

/* ---------------------------------------------------------------- form fields */

const fieldClass =
  'rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted/70 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Field({ label, error, hint, id, className, ...rest }: FieldProps) {
  const inputId = id || rest.name
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={inputId} className="block text-[13px] font-medium">{label}</label>
      <input id={inputId} aria-invalid={!!error} aria-describedby={error || hint ? `${inputId}-help` : undefined}
        className={cn(fieldClass, 'h-10 w-full', error && 'border-danger focus:border-danger focus:ring-danger/25')} {...rest} />
      {(error || hint) && (
        <p id={`${inputId}-help`} className={cn('text-xs', error ? 'text-danger' : 'text-muted')}>{error || hint}</p>
      )}
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, 'h-8 cursor-pointer pr-8 text-[13px]', className)} {...rest}>
      {children}
    </select>
  )
}

/* ---------------------------------------------------------------- status */

const OUTCOME_STYLE: Record<Outcome, { tone: string; icon: typeof Info; label: string }> = {
  queued: { tone: 'info', icon: Hourglass, label: 'Queued' },
  running: { tone: 'running', icon: Loader2, label: 'Running' },
  completed: { tone: 'success', icon: CircleCheck, label: 'Completed' },
  failed: { tone: 'danger', icon: CircleX, label: 'Failed' },
  timeout: { tone: 'warning', icon: Clock, label: 'Timed out' },
  'memory limit': { tone: 'warning', icon: MemoryStick, label: 'Memory limit' },
  'compile error': { tone: 'danger', icon: FileCode, label: 'Compile error' },
}

// Full class names spelled out so Tailwind can find them.
const TONES: Record<string, string> = {
  info: 'border-info/30 bg-info/10 text-info',
  running: 'border-running/30 bg-running/10 text-running',
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
}

export function StatusBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  const { tone, icon: Icon, label } = OUTCOME_STYLE[outcome]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', TONES[tone], outcome === 'running' && 'animate-pulse', className)}>
      <Icon className={cn('h-3.5 w-3.5', outcome === 'running' && 'animate-spin')} aria-hidden />
      {label}
    </span>
  )
}

export function MetricChip({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-raised px-2 py-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className={cn('font-medium', mono && 'font-mono')}>{value}</span>
    </span>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard blocked; nothing useful to do
    }
  }
  return (
    <IconButton label={copied ? 'Copied' : label} onClick={copy} disabled={!text}>
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </IconButton>
  )
}

/* ---------------------------------------------------------------- feedback */

const BANNER: Record<'error' | 'success' | 'info' | 'warning', { cls: string; icon: typeof Info }> = {
  error: { cls: TONES.danger, icon: AlertTriangle },
  success: { cls: TONES.success, icon: CircleCheck },
  info: { cls: TONES.info, icon: Info },
  warning: { cls: TONES.warning, icon: AlertTriangle },
}

export function Banner({ kind = 'error', children, onClose, className }: {
  kind?: keyof typeof BANNER; children: ReactNode; onClose?: () => void; className?: string
}) {
  if (!children) return null
  const { cls, icon: Icon } = BANNER[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1 text-fg">{children}</div>
      {onClose && (
        <button aria-label="Dismiss" onClick={onClose} className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
      )}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-muted', className)} aria-hidden />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-raised', className)} />
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-raised text-muted">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-line bg-surface', className)}>{children}</div>
}

/* ---------------------------------------------------------------- brand & theme */

export function Logo({ to = '/', compact }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight" aria-label="CodeFlow home">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-[13px] font-bold text-on-primary">{'{}'}</span>
      {!compact && <span className="text-[15px]">CodeFlow</span>}
    </Link>
  )
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex items-center rounded-md border border-line bg-surface p-0.5">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} role="radio" aria-checked={preference === value} aria-label={`${label} theme`} title={`${label} theme`}
          onClick={() => setPreference(value)}
          className={cn('flex h-6 w-7 items-center justify-center rounded transition-colors',
            preference === value ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}
