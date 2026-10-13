import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { getAuthErrorMessage, login } from '../services/auth'
import { Banner, Button, Field, Logo, ThemeToggle } from '../components/ui'
import { useSession } from '../lib/session'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6 rounded-lg border border-line bg-surface p-6 shadow-sm">{children}</div>
          <p className="mt-6 text-center text-[13px] text-muted">{footer}</p>
        </div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const notice = useLocation().state as { registered?: boolean; expired?: boolean } | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const errs: typeof fieldErrors = {}
    if (!EMAIL_PATTERN.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      signIn(await login({ email: email.trim(), password }))
      navigate('/workspace')
    } catch (err) {
      setError(getAuthErrorMessage(err, 'login'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Log in to CodeFlow" subtitle="Pick up where you left off."
      footer={<>No account yet? <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link></>}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {notice?.registered && !error && <Banner kind="success">Account created. You can log in now.</Banner>}
        {notice?.expired && !error && <Banner kind="info">Your session expired. Please log in again.</Banner>}
        <Banner kind="error">{error}</Banner>
        <Field label="Email" name="email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} autoFocus />
        <Field label="Password" name="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          {submitting ? 'Logging in…' : <>Log in <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>
    </AuthLayout>
  )
}
