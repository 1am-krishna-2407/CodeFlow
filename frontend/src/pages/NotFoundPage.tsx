import { ArrowLeft } from 'lucide-react'
import { ButtonLink, Logo } from '../components/ui'
import { useSession } from '../lib/session'

export default function NotFoundPage() {
  const { authed } = useSession()
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center px-4 sm:px-6"><Logo /></header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <p className="font-mono text-sm text-primary">exit code 404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">The page you were looking for doesn&apos;t exist or has moved.</p>
        <ButtonLink to={authed ? '/workspace' : '/'} variant="primary" className="mt-6">
          <ArrowLeft className="h-4 w-4" /> {authed ? 'Back to the workspace' : 'Back to home'}
        </ButtonLink>
      </main>
    </div>
  )
}
